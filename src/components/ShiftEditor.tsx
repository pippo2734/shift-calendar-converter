"use client";

import { useState } from "react";
import { ParseResult, ShiftEvent } from "@/types";
import { motion } from "framer-motion";
import { Calendar as CalendarIcon, Download, User } from "lucide-react";
import { clsx } from "clsx";
import * as ics from "ics";

interface ShiftEditorProps {
    data: ParseResult;
    onReset: () => void;
}

export default function ShiftEditor({ data, onReset }: ShiftEditorProps) {
    const [selectedEmployee, setSelectedEmployee] = useState<string>("");
    const daysInMonth = 31; // Simplification, should be calculated from data.month

    // Helper to format date for CSV: dtYYYY-MM-DD HH:MM:SS
    const formatCsvDate = (dateStr: string, timeStr?: string) => {
        if (!timeStr) return `dt${dateStr} 00:00:00`;
        return `dt${dateStr} ${timeStr}:00`;
    };

    const handleDownloadCsv = () => {
        if (!selectedEmployee) return;

        const employeeShifts = data.shifts.filter(s =>
            s.employeeName === selectedEmployee &&
            (
                (s.type === "Shift" && s.startTime && s.endTime) ||
                (s.type.includes("公") || s.type.includes("休") || s.type.includes("有") || s.type.includes("希"))
            )
        );

        if (employeeShifts.length === 0) {
            alert("エクスポートするデータが見つかりませんでした。");
            return;
        }

        // Standard Garoon/Cybozu Import Format
        // Header: 日付,開始時刻,終了時刻,予定,メモ
        const headers = [
            "日付", "開始時刻", "終了時刻", "予定", "メモ"
        ];

        const rows = employeeShifts.map(shift => {
            const isShift = shift.type === "Shift";

            // Format Date as YYYY/MM/DD
            const [y, m, d] = shift.date.split("-");
            const dateStr = `${y}/${m}/${d}`;

            let startTime = "";
            let endTime = "";
            let title = "";
            let memo = "";

            if (isShift && shift.startTime && shift.endTime) {
                startTime = shift.startTime;
                endTime = shift.endTime;
                title = "在宅";
            } else {
                // Holiday -> No Time -> All Day Event (Banner)
                title = "公休";
            }

            // Map to array order
            return [
                dateStr,
                startTime,
                endTime,
                title,
                memo
            ].map(v => `"${v}"`).join(",");
            // Quote values for CSV safety
        });

        const csvContent = [headers.join(","), ...rows].join("\n");

        // Convert string to UTF-16LE with BOM (Required for Windows/Excel/Garoon)
        const contentBuffer = new ArrayBuffer(2 + csvContent.length * 2);
        const view = new DataView(contentBuffer);

        // BOM (0xFF, 0xFE)
        view.setUint16(0, 0xFEFF, true);

        // Write content
        for (let i = 0; i < csvContent.length; i++) {
            view.setUint16(2 + i * 2, csvContent.charCodeAt(i), true);
        }

        const blob = new Blob([contentBuffer], { type: "text/csv;charset=utf-16le" });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", `import_schedule_${selectedEmployee}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleDownloadIcs = async () => {
        if (!selectedEmployee) return;

        // Filter for valid shifts (including Shift, Holiday, etc.)
        const employeeShifts = data.shifts.filter(s =>
            s.employeeName === selectedEmployee &&
            (
                (s.type === "Shift" && s.startTime && s.endTime) ||
                (s.type.includes("公") || s.type.includes("休") || s.type.includes("有"))
            )
        );

        if (employeeShifts.length === 0) {
            alert("この従業員のシフトデータが見つかりませんでした。");
            return;
        }

        const events: ics.EventAttributes[] = employeeShifts.map(shift => {
            const [year, month, day] = shift.date.split("-").map(Number);

            // Case 1: Regular Shift
            if (shift.type === "Shift" && shift.startTime && shift.endTime) {
                const [startH, startM] = shift.startTime.split(":").map(Number);
                const [endH, endM] = shift.endTime.split(":").map(Number);

                // Handle overnight shifts
                let endYear = year;
                let endMonth = month;
                let endDay = day;

                if (endH < startH) {
                    const d = new Date(year, month - 1, day);
                    d.setDate(d.getDate() + 1);
                    endYear = d.getFullYear();
                    endMonth = d.getMonth() + 1;
                    endDay = d.getDate();
                }

                return {
                    title: '在宅',
                    start: [year, month, day, startH, startM],
                    end: [endYear, endMonth, endDay, endH, endM],
                    description: `Shift: ${shift.startTime} - ${shift.endTime}`,
                    calName: 'Shift Schedule',
                    productId: 'ShiftCalendarConverter'
                };
            }

            // Case 2: Holiday / Paid Leave
            // User requested everything to be "公休"
            let title = "公休";

            return {
                title: title,
                start: [year, month, day],
                end: [year, month, day + 1],
                description: `Type: ${shift.type}`,
                calName: 'Shift Schedule',
                productId: 'ShiftCalendarConverter'
            };
        });

        // Generate ICS content
        // Note: ics.createEvents is synchronous usually, but check type defs
        // ics package returns { error, value }
        const { error, value } = ics.createEvents(events);

        if (error) {
            console.error(error);
            alert("カレンダーファイルの生成に失敗しました");
            return;
        }

        if (value) {
            const blob = new Blob([value], { type: "text/calendar;charset=utf-8" });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.setAttribute("download", `shifts_${selectedEmployee}_${data.month}.ics`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    return (
        <div className="w-full max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">

            {/* Header Controls */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-6 glass-card">
                <div>
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <CalendarIcon className="text-cyan-400" />
                        {data.month} シフト表
                    </h2>
                    <p className="text-slate-400">名前を選択してカレンダーを出力してください。</p>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                    <button
                        onClick={onReset}
                        className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
                    >
                        ファイルを再アップロード
                    </button>

                    {/* CSV Export */}
                    <button
                        disabled={!selectedEmployee}
                        onClick={handleDownloadCsv}
                        className={clsx(
                            "flex items-center gap-2 px-4 py-3 rounded-xl font-bold transition-all shadow-lg text-sm",
                            selectedEmployee
                                ? "bg-slate-700 hover:bg-slate-600 text-white shadow-slate-900/20"
                                : "bg-slate-800 text-slate-600 cursor-not-allowed"
                        )}
                    >
                        <Download className="w-4 h-4" />
                        CSV出力 (確定版 v1.3)
                    </button>

                    {/* ICS Export */}
                    <button
                        disabled={!selectedEmployee}
                        onClick={handleDownloadIcs}
                        className={clsx(
                            "flex items-center gap-2 px-6 py-3 rounded-xl font-bold transition-all shadow-lg",
                            selectedEmployee
                                ? "bg-gradient-to-r from-cyan-500 to-blue-600 hover:shadow-cyan-500/25 text-white"
                                : "bg-slate-700 text-slate-500 cursor-not-allowed"
                        )}
                    >
                        <Download className="w-5 h-5" />
                        カレンダー登録 (ICS)
                    </button>
                </div>
            </div>

            {/* Main Grid View */}
            <div className="glass-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-slate-800/50 text-slate-300">
                            <tr>
                                <th className="p-4 sticky left-0 bg-slate-900 border-b border-slate-700 z-10">氏名</th>
                                {Array.from({ length: daysInMonth }).map((_, i) => (
                                    <th key={i} className="p-4 min-w-[80px] text-center border-b border-slate-700 border-l border-slate-700/50">
                                        {i + 1}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/50">
                            {data.employees.length === 0 ? (
                                <tr>
                                    <td colSpan={daysInMonth + 1} className="p-8 text-center text-slate-400">
                                        <div className="mb-4">データが見つかりませんでした。詳細情報を確認してください。</div>
                                        {data.debugInfo && (
                                            <div className="text-left bg-slate-900 p-4 rounded-lg overflow-auto max-h-64 text-xs font-mono">
                                                <p>Total Items: {data.debugInfo.totalItems}</p>
                                                <p>Rows Detected: {data.debugInfo.rowsDetected}</p>
                                                <p>Year/Month: {data.debugInfo.yearMonthFound}</p>
                                                <p>Date Row Index: {data.debugInfo.dateRowIndex}</p>
                                                <p className="mt-2 text-slate-300 font-bold">最初の10行:</p>
                                                {data.debugInfo.sampleRows.map((row, i) => (
                                                    <div key={i} className="whitespace-pre border-b border-slate-800 py-1">{i}: {row}</div>
                                                ))}
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ) : (
                                data.employees.map((employee) => (
                                    <tr
                                        key={employee}
                                        onClick={() => setSelectedEmployee(employee)}
                                        className={clsx(
                                            "cursor-pointer transition-colors hover:bg-white/5",
                                            selectedEmployee === employee ? "bg-cyan-500/10" : ""
                                        )}
                                    >
                                        <th className={clsx(
                                            "p-4 sticky left-0 font-medium z-10 transition-colors border-r border-slate-700",
                                            selectedEmployee === employee ? "bg-slate-800 text-cyan-300" : "bg-slate-900 text-slate-200"
                                        )}>
                                            <div className="flex items-center gap-2">
                                                <div className={clsx("w-1 h-8 rounded-full",
                                                    selectedEmployee === employee ? "bg-cyan-400" : "bg-transparent"
                                                )} />
                                                <User className="w-4 h-4 opacity-50" />
                                                {employee}
                                            </div>
                                        </th>
                                        {/* Render Shifts */}
                                        {Array.from({ length: daysInMonth }).map((_, i) => {
                                            const day = i + 1;
                                            const dateStr = `${data.month}-${String(day).padStart(2, '0')}`;

                                            // Find shift for this employee and date
                                            const shift = data.shifts.find(s =>
                                                s.employeeName === employee &&
                                                s.date === dateStr
                                            );

                                            return (
                                                <td key={i} className="p-2 text-center border-l border-slate-700/50 text-xs min-w-[70px]">
                                                    {shift ? (
                                                        shift.type === "Shift" ? (
                                                            <div className="flex flex-col items-center">
                                                                <span className="text-white font-medium">{shift.startTime}</span>
                                                                <span className="text-slate-500">{shift.endTime}</span>
                                                            </div>
                                                        ) : (
                                                            <div className={clsx(
                                                                "inline-block px-2 py-1 rounded-full text-[10px] font-bold",
                                                                shift.type.includes("有") ? "bg-blue-500/20 text-blue-300" :
                                                                    "bg-red-500/20 text-red-300"
                                                            )}>
                                                                {shift.type.includes("有") ? "有給" : "公休"}
                                                            </div>
                                                        )
                                                    ) : (
                                                        <span className="text-slate-700">-</span>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

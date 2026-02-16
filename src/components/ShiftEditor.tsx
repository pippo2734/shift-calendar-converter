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

        const headers = [
            "created", "creator", "modified", "modifier", "child_modified", "title", "label", "color",
            "is_all_day", "timezone", "dtstart", "dtend", "successor", "attendee", "facility",
            "facility_approval", "web_meeting_external_service", "web_meeting_url", "no_notify",
            "organizer", "organizer_belonging_groups", "body", "body_format", "holiday", "substitute",
            "location", "address", "icons", "attachment", "addressUser", "banner", "scope",
            "public_to_secretary", "additional_public", "is_confidential", "allow_attendee_edit",
            "view_presence_on_news", "default_presence", "create_as_secretary", "delegate_allowed",
            "send_mail", "alarm_time", "mail_type", "intent_from", "first_day_of_week", "recurrence",
            "recurrent_type", "recurrent_interval", "month_of_year", "recurrent_subtype", "days_of_week",
            "day_of_month", "week_of_month", "day_of_week", "irregular_dates", "recurrent_start",
            "limit_type", "limit_count", "limit_date", "recurrent_except_rule", "recurrent_except_target",
            "reserve1", "reserve2", "reserve3", "reserve4", "reserve5", "reserve6", "reserve7",
            "reserve8", "reserve9", "reserve10", "exceptional_list", "attendee_delegate", "is_tentative",
            "id", "container", "parent", "thread_id", "description", "type", "format", "issued",
            "available", "sort_order"
        ];

        const userId = "U:CJK:20665";

        const rows = employeeShifts.map(shift => {
            const isShift = shift.type === "Shift";
            const isAllDay = !isShift;

            let title = "在宅";
            let isBanner = "0";

            if (!isShift) {
                // Holiday -> Schedule (0)
                isBanner = "0";
                // User requested everything (including Paid Leave "有給") to be "公休"
                title = "公休";
            } else {
                // Shift -> Banner (1)
                isBanner = "1";
            }

            let startStr = "";
            let endStr = "";

            if (isAllDay) {
                startStr = formatCsvDate(shift.date);
                const [y, m, d] = shift.date.split("-").map(Number);
                const nextDay = new Date(y, m - 1, d);
                nextDay.setDate(nextDay.getDate() + 1);
                const ny = nextDay.getFullYear();
                const nm = String(nextDay.getMonth() + 1).padStart(2, '0');
                const nd = String(nextDay.getDate()).padStart(2, '0');
                endStr = `dt${ny}-${nm}-${nd} 00:00:00`;
            } else {
                startStr = formatCsvDate(shift.date, shift.startTime);
                const [y, m, d] = shift.date.split("-").map(Number);
                const [sh, sm] = shift.startTime!.split(":").map(Number);
                const [eh, em] = shift.endTime!.split(":").map(Number);

                let endY = y, endM = m, endD = d;
                if (eh < sh) {
                    const next = new Date(y, m - 1, d);
                    next.setDate(next.getDate() + 1);
                    endY = next.getFullYear();
                    endM = next.getMonth() + 1;
                    endD = next.getDate();
                }
                endStr = `dt${endY}-${String(endM).padStart(2, '0')}-${String(endD).padStart(2, '0')} ${shift.endTime}:00`;
            }

            const map: Record<string, string> = {
                "created": userId,
                "modifier": userId,
                "title": title,
                "is_all_day": isAllDay ? "1" : "0",
                "timezone": "Asia/Tokyo",
                "dtstart": startStr,
                "dtend": endStr,
                "body_format": "text/plain",
                "banner": isBanner,
                "scope": "public",
                "public_to_secretary": "1",
                "send_mail": "0",
                "mail_type": "none",
                "is_tentative": "0"
            };

            return headers.map(h => map[h] || "").join(",");
        });

        const csvContent = [headers.join(","), ...rows].join("\n");
        
        // Convert string to UTF-16LE with BOM
        // 1. Create a buffer for the BOM (2 bytes) + content (2 bytes per char)
        const contentBuffer = new ArrayBuffer(2 + csvContent.length * 2);
        const view = new DataView(contentBuffer);
        
        // 2. Write BOM (0xFF, 0xFE) for Little Endian
        view.setUint16(0, 0xFEFF, true); // true = littleEndian

        // 3. Write characters
        for (let i = 0; i < csvContent.length; i++) {
            view.setUint16(2 + i * 2, csvContent.charCodeAt(i), true); // true = littleEndian
        }

        const blob = new Blob([contentBuffer], { type: "text/csv;charset=utf-16le" });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", `company_import_${selectedEmployee}_${data.month}.csv`);
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
                        CSV出力 (会社用)
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

"use client";

import { useState, useEffect } from "react";
import { ParseResult, ShiftEvent } from "@/types";
import { motion } from "framer-motion";
import { Calendar as CalendarIcon, Download, User } from "lucide-react";
import { clsx } from "clsx";


interface ShiftEditorProps {
    data: ParseResult;
    onReset: () => void;
}

export default function ShiftEditor({ data, onReset }: ShiftEditorProps) {
    const [selectedEmployee, setSelectedEmployee] = useState<string>("");
    const [garoonId, setGaroonId] = useState<string>(""); // Numeric User ID (e.g., 20665)
    const daysInMonth = 31; // Simplification, should be calculated from data.month

    // Load saved ID on mount
    useEffect(() => {
        try {
            const savedId = localStorage.getItem("garoon_uid_numeric");
            if (savedId) {
                setGaroonId(savedId);
            }
        } catch (e) {
            console.error("LocalStorage access failed", e);
        }
    }, []);

    // Save ID on change
    const handleIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newVal = e.target.value;
        // Allow only numbers (optional, but good for validation)
        setGaroonId(newVal);
        localStorage.setItem("garoon_uid_numeric", newVal);
    };

    // Helper: Generate Random ID (21 chars)
    const generateId = () => {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        let result = "";
        for (let i = 0; i < 21; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    };

    // Helper: Format Date/Time (dtYYYY-MM-DD HH:MM:SS)
    // Ensures zero-padding for HH, MM, SS
    const formatDateTime = (dateStr: string, timeStr?: string) => {
        // dateStr is YYYY-MM-DD
        if (!timeStr) {
            return `dt${dateStr} 00:00:00`;
        }
        // timeStr might be "9:15" -> needs to be "09:15:00"
        const [h, m] = timeStr.split(":").map(Number);
        const hh = String(h).padStart(2, '0');
        const mm = String(m).padStart(2, '0');
        return `dt${dateStr} ${hh}:${mm}:00`;
    };

    // Helper: Get Week of Month (1-5)
    const getWeekOfMonth = (date: Date) => {
        const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
        const pastDays = (date.getTime() - firstDay.getTime()) / 86400000;
        return Math.ceil((pastDays + firstDay.getDay() + 1) / 7);
    };

    // Helper: Get Current Timestamp (dtYYYY-MM-DD HH:MM:SS)
    const getCurrentTimestamp = () => {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        const ss = String(now.getSeconds()).padStart(2, '0');
        return `dt${y}-${m}-${d} ${hh}:${mm}:${ss}`;
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

        // Prepare Common Values
        const currentTimestamp = getCurrentTimestamp();
        // Use user ID if provided, prefixed strictly with U:CJK:
        const userIdCode = garoonId ? `U:CJK:${garoonId.trim()}` : "";
        const container = garoonId ? `%U:CJK:${garoonId.trim()}%/schedule` : "";

        // 84 Headers to match Garoon Specs and prevent "Unknown field" errors
        const headers = [
            "created", "creator", "modified", "modifier", "child_modified",
            "title", "label", "color", "is_all_day", "timezone",
            "dtstart", "dtend", "successor", "attendee", "facility",
            "facility_approval", "web_meeting_external_service", "web_meeting_url", "no_notify", "organizer",
            "organizer_belonging_groups", "body", "body_format", "holiday", "substitute",
            "location", "address", "icons", "attachment", "addressUser",
            "public_to_secretary", "scope", "additional_public", "is_confidential", "allow_attendee_edit",
            "view_presence_on_news", "default_presence", "create_as_secretary", "delegate_allowed", "send_mail",
            "alarm_time", "mail_type", "intent_from", "first_day_of_week", "recurrence",
            "recurrent_type", "recurrent_interval", "month_of_year", "recurrent_subtype", "days_of_week",
            "day_of_month", "week_of_month", "day_of_week", "irregular_dates", "recurrent_start",
            "limit_type", "limit_count", "limit_date", "recurrent_except_rule", "recurrent_except_target",
            "reserve1", "reserve2", "reserve3", "reserve4", "reserve5",
            "reserve6", "reserve7", "reserve8", "reserve9", "reserve10",
            "exceptional_list", "attendee_delegate", "is_tentative", "id", "container",
            "parent", "thread_id", "description", "type", "format",
            "issued", "available", "sort_order"
        ];

        const rows = employeeShifts.map(shift => {
            const isShift = shift.type === "Shift";
            const isAllDay = !isShift;

            const now = new Date(); // Created/Modified time (same for all for simplicity, or strictly current)

            // Event Details
            let title = "在宅";
            let body = "Shift: " + (shift.startTime || "") + " - " + (shift.endTime || "");
            let holidayFlag = "no"; // "no" for everything unless we have a specific mapping? User said "holiday: 'no'" in correct table.

            if (!isShift) {
                title = "公休";
                body = "Type: 公休";
                // User table says `holiday` is always "no".
            }

            // Timestamps
            const [y, m, d] = shift.date.split("-");
            let startStr = "";
            let endStr = "";

            const startDateObj = new Date(Number(y), Number(m) - 1, Number(d));

            if (isAllDay) {
                // All Day: Start 00:00:00, End Next Day 00:00:00
                startStr = formatDateTime(`${y}-${m}-${d}`, "0:0"); // 00:00:00

                const nextDay = new Date(startDateObj);
                nextDay.setDate(nextDay.getDate() + 1);
                const ny = nextDay.getFullYear();
                const nm = String(nextDay.getMonth() + 1).padStart(2, '0');
                const nd = String(nextDay.getDate()).padStart(2, '0');
                endStr = formatDateTime(`${ny}-${nm}-${nd}`, "0:0");
            } else {
                // Shift: Specific Time
                startStr = formatDateTime(`${y}-${m}-${d}`, shift.startTime || "09:00");

                // Calculate end time
                const [sh, sm] = (shift.startTime || "09:00").split(":").map(Number);
                const [eh, em] = (shift.endTime || "18:00").split(":").map(Number);
                let endY = Number(y), endM = Number(m), endD = Number(d);

                if (eh < sh) {
                    const next = new Date(Number(y), Number(m) - 1, Number(d));
                    next.setDate(next.getDate() + 1);
                    endY = next.getFullYear();
                    endM = next.getMonth() + 1;
                    endD = next.getDate();
                }
                const endYStr = String(endY);
                const endMStr = String(endM).padStart(2, '0');
                const endDStr = String(endD).padStart(2, '0');
                // Ensure time is formatted HH:MM
                const endTStr = `${eh}:${em}`;

                endStr = formatDateTime(`${endYStr}-${endMStr}-${endDStr}`, endTStr);
            }

            const eventId = generateId(); // Random ID

            // 84 Columns Mapping
            const cols = [
                currentTimestamp, // 0: created (dt...)
                userIdCode,       // 1: creator (U:CJK:...)
                currentTimestamp, // 2: modified
                userIdCode,       // 3: modifier
                currentTimestamp, // 4: child_modified
                title,            // 5: title ("公休")
                "",               // 6: label
                "#dfeaff",        // 7: color
                isAllDay ? "1" : "0", // 8: unknown/is_all_day ? Sample has 1 for holiday
                "Asia/Tokyo",     // 9: timezone
                startStr,         // 10: dtstart
                endStr,           // 11: dtend
                "",               // 12: ?
                userIdCode,       // 13: attendee (U:CJK:...)
                "",               // 14: facility
                "",               // 15: facility_approval
                "",               // 16: web_meeting_external_service
                "",               // 17
                "3",              // 18: no_notify
                userIdCode,       // 19: organizer
                "",               // 20: groups
                body,             // 21: body
                "text/plain",     // 22: body_format
                "no",             // 23: holiday
                "0",              // 24: substitute
                "",               // 25: location
                "",               // 26: address
                "",               // 27: icons
                "",               // 28: attachment
                "",               // 29
                "0",              // 30: ? (Sample has 0)
                "public",         // 31: scope
                "0",              // 32
                "",               // 33
                "0",              // 34
                "0",              // 35
                "0",              // 36
                "0",              // 37
                "2",              // 38: create_as_secretary
                "0",              // 39
                "1",              // 40: send_mail
                "-1",             // 41: alarm_time
                "1\n2",           // 42: mail_type
                "",               // 43
                "0",              // 44
                "0",              // 45: recurrence
                "none",           // 46: recurrent_type
                "1",              // 47
                "1",              // 48
                "",               // 49
                "",               // 50
                "1",              // 51
                getWeekOfMonth(startDateObj).toString(), // 52: week_of_month
                startDateObj.getDay().toString(),        // 53: day_of_week
                startStr,         // 54: irregular_dates
                startStr,         // 55: recurrent_start
                "",               // 56
                "10",             // 57: limit_count
                "",               // 58
                "0",              // 59
                "",               // 60
                "", "", "", "", "", "", "", "", "", "", // 61-70: reserves
                "",               // 71
                "",               // 72
                "0",              // 73: is_tentative
                eventId,          // 74: id
                container,        // 75: container
                "",               // 76
                eventId,          // 77: thread_id
                "",               // 78
                "/atypes/ariel/schedule", // 79: type
                "text/xhtml",     // 80: format
                "",               // 81
                "",               // 82
                "0"               // 83: sort_order
            ];

            return cols.map(c => `"${c}"`).join(",");
        });

        const csvContent = [headers.map(h => `"${h}"`).join(","), ...rows].join("\n");

        // Convert string to UTF-16LE with BOM
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
        link.setAttribute("download", `schedule_export_${selectedEmployee}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleDownloadIcs = async () => {
        if (!selectedEmployee) return;

        // Dynamically import ics to avoid SSR/Client init crashes
        const ics = (await import("ics"));

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

                <div className="flex flex-col items-end gap-3">
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            placeholder="ユーザーID番号 (例: 20665)"
                            value={garoonId}
                            onChange={handleIdChange}
                            className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white w-64 focus:outline-none focus:border-cyan-500 transition-colors"
                        />
                    </div>

                    <div className="flex flex-wrap items-center gap-4">
                        <button
                            onClick={onReset}
                            className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
                        >
                            再アップロード
                        </button>

                        {/* CSV Export */}
                        <button
                            disabled={!selectedEmployee}
                            onClick={handleDownloadCsv}
                            className={clsx(
                                "flex items-center gap-2 px-4 py-3 rounded-xl font-bold transition-all shadow-lg text-sm",
                                !selectedEmployee
                                    ? "bg-slate-800 text-slate-600 cursor-not-allowed" // Truly disabled (No employee)
                                    : !garoonId
                                        ? "bg-amber-900/50 text-amber-200 border border-amber-700/50 hover:bg-amber-900/80 cursor-pointer" // Hard Warning (Employee selected, ID missing)
                                        : "bg-slate-700 hover:bg-slate-600 text-white shadow-slate-900/20" // Ready
                            )}
                        >
                            <Download className="w-4 h-4" />
                            CSV出力 (v3.0)
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
                            カレンダー (ICS)
                        </button>
                    </div>
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

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

    const handleDownloadIcs = async () => {
        if (!selectedEmployee) return;

        // Filter for valid shifts (ignoring holidays for now, or maybe make them all-day events later)
        // Currently targeting only "Shift" type which has start/end times
        const employeeShifts = data.shifts.filter(s =>
            s.employeeName === selectedEmployee && s.type === "Shift" && s.startTime && s.endTime
        );

        if (employeeShifts.length === 0) {
            alert("No shift data found for this employee.");
            return;
        }

        const events: ics.EventAttributes[] = employeeShifts.map(shift => {
            const [year, month, day] = shift.date.split("-").map(Number);
            const [startH, startM] = shift.startTime.split(":").map(Number);
            const [endH, endM] = shift.endTime.split(":").map(Number);

            // Handle overnight shifts (e.g. 22:00 to 05:00)
            // If end hour is significantly smaller than start hour, assume next day.
            let endYear = year;
            let endMonth = month;
            let endDay = day;

            if (endH < startH) {
                const d = new Date(year, month - 1, day);
                d.setDate(d.getDate() + 1); // Add 1 day
                endYear = d.getFullYear();
                endMonth = d.getMonth() + 1;
                endDay = d.getDate();
            }

            return {
                title: 'Shift Work',
                start: [year, month, day, startH, startM],
                end: [endYear, endMonth, endDay, endH, endM],
                description: `Shift: ${shift.startTime} - ${shift.endTime}`,
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
            alert("Failed to generate calendar file");
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
                        {data.month} Shift Schedule
                    </h2>
                    <p className="text-slate-400">Select your name to export your calendar.</p>
                </div>

                <div className="flex items-center gap-4">
                    <button
                        onClick={onReset}
                        className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
                    >
                        Upload New File
                    </button>
                    <button
                        disabled={!selectedEmployee}
                        onClick={handleDownloadIcs}
                        className={clsx(
                            "flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all shadow-lg",
                            selectedEmployee
                                ? "bg-gradient-to-r from-cyan-500 to-blue-600 hover:shadow-cyan-500/25 text-white"
                                : "bg-slate-700 text-slate-500 cursor-not-allowed"
                        )}
                    >
                        <Download className="w-5 h-5" />
                        Export to Calendar
                    </button>
                </div>
            </div>

            {/* Main Grid View */}
            <div className="glass-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-slate-800/50 text-slate-300">
                            <tr>
                                <th className="p-4 sticky left-0 bg-slate-900 border-b border-slate-700 z-10">Employee Name</th>
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
                                        <div className="mb-4">No employees detected. Attempting to debug...</div>
                                        {data.debugInfo && (
                                            <div className="text-left bg-slate-900 p-4 rounded-lg overflow-auto max-h-64 text-xs font-mono">
                                                <p>Total Items: {data.debugInfo.totalItems}</p>
                                                <p>Rows Detected: {data.debugInfo.rowsDetected}</p>
                                                <p>Year/Month: {data.debugInfo.yearMonthFound}</p>
                                                <p>Date Row Index: {data.debugInfo.dateRowIndex}</p>
                                                <p className="mt-2 text-slate-300 font-bold">First 10 Rows:</p>
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
                                                                shift.type.includes("公") ? "bg-red-500/20 text-red-300" :
                                                                    shift.type.includes("希") ? "bg-yellow-500/20 text-yellow-300" :
                                                                        "bg-blue-500/20 text-blue-300"
                                                            )}>
                                                                {shift.type}
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

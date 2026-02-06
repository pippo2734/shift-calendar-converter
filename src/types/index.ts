export interface ShiftEvent {
    date: string; // YYYY-MM-DD
    startTime: string; // HH:mm
    endTime: string; // HH:mm
    type: string; // "Shift", "Holiday", etc.
    employeeName: string;
}

export interface ParseResult {
    employees: string[]; // List of employee names found
    shifts: ShiftEvent[];
    month: string; // YYYY-MM
    debugInfo?: {
        totalItems: number;
        rowsDetected: number;
        yearMonthFound: string;
        dateRowIndex: number;
        sampleRows: string[];
    };
}

export interface ParsedItem {
    str: string;
    x: number;
    y: number;
    w: number;
    h: number;
}

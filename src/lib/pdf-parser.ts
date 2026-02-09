import * as pdfjsLib from "pdfjs-dist";
import { ParsedItem, ParseResult, ShiftEvent } from "@/types";

// Setup worker with dynamic version (now that we locked package to 4.4.168)
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

export async function parseShiftPdf(file: File): Promise<ParseResult> {
    // SPECIAL HANDLING: Demo Mode
    if (file.name === "demo.pdf" && file.size === 0) {
        console.log("Using Demo Data (Bypassing Parser)");
        return getMockData();
    }

    try {
        const arrayBuffer = await file.arrayBuffer();

        // Check for empty content
        if (arrayBuffer.byteLength === 0) {
            throw new Error("File is empty");
        }

        const loadingTask = pdfjsLib.getDocument({
            data: arrayBuffer,
            cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/cmaps/`,
            cMapPacked: true,
        });

        const pdf = await loadingTask.promise;
        console.log(`PDF Loaded: ${pdf.numPages} pages`);

        const page = await pdf.getPage(1);

        // Extract text content with coordinates
        const textContent = await page.getTextContent();

        // Transform items into a more usable format
        const items: ParsedItem[] = textContent.items.map((item: any) => {
            const tx = item.transform;
            return {
                str: item.str,
                x: tx[4],
                y: tx[5],
                w: item.width,
                h: item.height,
            };
        });

        console.log("Parsed PDF Items:", items.slice(0, 5)); // Log first 5 items
        return analyzeShiftData(items);

    } catch (error) {
        console.error("PDF Parsing Critical Error:", error);
        throw error;
    }
}

function getMockData(): ParseResult {
    return {
        month: "2026-02",
        employees: ["宮部 信行", "菊地 祐紀", "岡部 未波", "家永 美里", "松村 卓"],
        shifts: []
    };
}


// Helper to identify if a string is a time "HH:MM"
function isTime(str: string) {
    return /^\d{1,2}:\d{2}$/.test(clean(str));
}

// Helper to clean strings
function clean(str: string) {
    // Remove whitespace and weird chars
    return str.replace(/\s+/g, "").trim();
}

// Function to check if string looks like a Japanese Name (Kanji/Kana, length > 1)
function isLikelyName(str: string) {
    const s = clean(str);
    if (s.length < 2) return false;
    if (/\d/.test(s)) return false; // Contains numbers -> unlikely to be name (in this context)
    // Check for some kana/kanji ranges (simplified)
    return /[一-龠ぁ-んァ-ン]/.test(s);
}

function analyzeShiftData(items: ParsedItem[]): ParseResult {
    const debugLogs: string[] = [];
    const log = (msg: string) => {
        console.log(msg);
        debugLogs.push(msg);
    };

    log(`Total items: ${items.length}`);

    // 1. Sort items by Y (descending) then X (ascending)
    items.sort((a, b) => {
        if (Math.abs(a.y - b.y) > 4) {
            return b.y - a.y;
        }
        return a.x - b.x;
    });

    // 2. Group into Rows
    const rows: ParsedItem[][] = [];
    let currentRow: ParsedItem[] = [];
    let currentY = -1;

    for (const item of items) {
        if (currentY === -1 || Math.abs(item.y - currentY) <= 12) { // Increased tolerance to 12
            currentRow.push(item);
            if (currentY === -1) currentY = item.y;
        } else {
            rows.push(currentRow);
            currentRow = [item];
            currentY = item.y;
        }
    }
    if (currentRow.length > 0) rows.push(currentRow);
    log(`Rows detected: ${rows.length}`);

    // 3. Find Context (Year/Month)
    let year = new Date().getFullYear();
    let month = new Date().getMonth() + 1;
    const yearMonthRegex = /(\d{4})年(\d{1,2})月/;

    for (let i = 0; i < Math.min(rows.length, 10); i++) {
        const rowText = rows[i].map(it => it.str).join("");
        const match = rowText.match(yearMonthRegex);
        if (match) {
            year = parseInt(match[1]);
            month = parseInt(match[2]);
            log(`Found Date: ${year}-${month}`);
            break;
        }
    }

    // 4. Identify Grid Strategy
    // Method A: Find row with many dates (1..31)
    // Method B: Find rows with Name + Time patterns

    const shifts: ShiftEvent[] = [];
    const employees: string[] = [];

    // Let's try to find "Shift Rows" directly
    const shiftRows: { rowIdx: number, name: string, y: number }[] = [];

    // Track X coordinates of time entries to guess columns
    const timeXCoords: number[] = [];

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        // Check first item for Name Candidate (Leftmost, Kanji/Kana)
        // Assuming name is within first 2 items
        const leftItems = row.filter(it => it.x < 100); // Only look at far left items
        const nameItem = leftItems.find(it => isLikelyName(it.str));

        if (nameItem) {
            // Check if this row has "Time-like" data
            const timeItems = row.filter(it => isTime(it.str));

            // Also check NEXT row for time items (End times often on next line)
            let nextRowTimes = 0;
            if (i + 1 < rows.length) {
                nextRowTimes = rows[i + 1].filter(it => isTime(it.str)).length;
            }

            if (timeItems.length > 3 || (timeItems.length > 0 && nextRowTimes > 0)) {
                // This is likely a shift row
                shiftRows.push({
                    rowIdx: i,
                    name: clean(nameItem.str),
                    y: nameItem.y
                });

                // Collect X coords to determine grid columns
                timeItems.forEach(t => timeXCoords.push(t.x + t.w / 2));
                if (i + 1 < rows.length) {
                    rows[i + 1].filter(it => isTime(it.str)).forEach(t => timeXCoords.push(t.x + t.w / 2));
                }
            }
        }
    }

    log(`Shift Rows Candidates: ${shiftRows.length}`);

    // If we found shift rows, we can start extracting
    if (shiftRows.length > 0) {
        // Determine Columns based on clusters of X coords
        // Simple clustering: Sort Xs, find gaps > threshold
        timeXCoords.sort((a, b) => a - b);

        const columnsX: number[] = [];
        if (timeXCoords.length > 0) {
            // Naive clustering: if diff > 10, new column
            let clusterSum = timeXCoords[0];
            let clusterCount = 1;
            let lastX = timeXCoords[0];

            for (let k = 1; k < timeXCoords.length; k++) {
                if (timeXCoords[k] - lastX > 15) { // Gap threshold
                    columnsX.push(clusterSum / clusterCount); // Avg of previous cluster
                    clusterSum = timeXCoords[k];
                    clusterCount = 1;
                } else {
                    clusterSum += timeXCoords[k];
                    clusterCount++;
                }
                lastX = timeXCoords[k];
            }
            log(`Estimated Columns: ${columnsX.length}`);

            // Calculate dynamic search width based on column spacing
            let searchRadius = 25; // fallback default
            if (columnsX.length > 1) {
                const gaps = [];
                for (let i = 1; i < columnsX.length; i++) gaps.push(columnsX[i] - columnsX[i - 1]);
                const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
                searchRadius = avgGap * 0.45; // Scan almost half the gap width to left/right
            }
            log(`Dynamic Search Radius: ${searchRadius.toFixed(2)}`);

            // Now iterate shift rows and map items to columns
            for (let i = 0; i < shiftRows.length; i++) {
                const { rowIdx, name } = shiftRows[i];
                employees.push(name);

                // Determine likely rows belonging to this employee
                // We'll look at the current row and subsequent rows until the next employee's row
                const nextRowLimit = (i + 1 < shiftRows.length) ? shiftRows[i + 1].rowIdx : rows.length;

                // Allow capturing up to 3 rows per employee (Name/Start/End often span 2-3 visual rows)
                // But do not cross into the next employee's territory
                const rowsToAnalyze: ParsedItem[][] = [];
                const maxRows = 3;

                for (let r = 0; r < maxRows; r++) {
                    const targetIdx = rowIdx + r;
                    if (targetIdx < nextRowLimit && targetIdx < rows.length) {
                        rowsToAnalyze.push(rows[targetIdx]);
                    }
                }

                // COLUMN-CENTRIC APPROACH
                columnsX.forEach((colX, colIdx) => {
                    const day = colIdx + 1;

                    // Find ALL items in this column's vertical strip across ALL analyzed rows
                    const inRange = (it: ParsedItem) => Math.abs((it.x + it.w / 2) - colX) < searchRadius;

                    const itemsInCell: ParsedItem[] = [];
                    rowsToAnalyze.forEach(r => {
                        itemsInCell.push(...r.filter(inRange));
                    });

                    if (itemsInCell.length === 0) return;

                    // Sort items by Y descending (Top -> Bottom)
                    itemsInCell.sort((a, b) => b.y - a.y);

                    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

                    let type = "";
                    let start = "";
                    let end = "";

                    // Analyze content of ALL items in this cell
                    const allTexts = itemsInCell.map(it => clean(it.str));

                    // 1. Check for Holiday/Special Types
                    const typeKeywords = ["公", "休", "有", "希", "欠", "半", "遅", "早"];
                    const foundType = allTexts.find(t => typeKeywords.some(k => t.includes(k)));

                    if (foundType) {
                        type = foundType;
                    } else {
                        // 2. Extract Times
                        const timeRegex = /\d{1,2}:\d{2}/g;
                        const foundTimes: string[] = [];

                        itemsInCell.forEach(item => {
                            const str = clean(item.str);
                            const matches = str.match(timeRegex);
                            if (matches) {
                                foundTimes.push(...matches);
                            }
                        });

                        // If we found times, assume:
                        // 1st time = Start
                        // 2nd time = End
                        // If 3+ times found (rare), take first and last? Or first and second.
                        // Usually top-most is start, bottom-most is end.
                        if (foundTimes.length > 0) {
                            type = "Shift";
                            start = foundTimes[0];
                            if (foundTimes.length > 1) {
                                // If more than 2, maybe take the last one as end?
                                // Usually just 2.
                                end = foundTimes[foundTimes.length - 1];
                            }
                        }
                    }

                    if (type) {
                        shifts.push({
                            date: dateStr,
                            startTime: start,
                            endTime: end,
                            type,
                            employeeName: name
                        });
                    }
                });
            }
        } else {
            log("No shift rows found via heuristic.");
        }

        return {
            month: `${year}-${String(month).padStart(2, '0')}`,
            employees: Array.from(new Set(employees)),
            shifts,
            debugInfo: {
                totalItems: items.length,
                rowsDetected: rows.length,
                yearMonthFound: `${year}-${month}`,
                dateRowIndex: -1,
                sampleRows: debugLogs.concat(rows.slice(0, 15).map(row => row.map(r => r.str).join("|"))),
            }
        };
    }

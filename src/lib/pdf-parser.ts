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
                h: item.height, // Note: width/height might be 0 for some items
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
    // IMPORTANT: pdf.js usually uses valid Cartesian coords where (0,0) is bottom-left.
    // So distinct Y means higher is UP.
    // Text flow is usually Top -> Bottom, so Y should be Descending.
    items.sort((a, b) => {
        if (Math.abs(a.y - b.y) > 4) {
            return b.y - a.y;
        }
        return a.x - b.x;
    });

    // 2. Extract Context (Year/Month)
    let year = new Date().getFullYear();
    let month = new Date().getMonth() + 1;
    const yearMonthRegex = /(\d{4})年(\d{1,2})月/;

    for (let i = 0; i < Math.min(items.length, 50); i++) {
        const match = items[i].str.match(yearMonthRegex);
        if (match) {
            year = parseInt(match[1]);
            month = parseInt(match[2]);
            log(`Found Date: ${year}-${month}`);
            break;
        }
    }

    // 3. Grid Detection Strategy: GLOBAL COLUMN DETECTION
    // Collect all "Time-like" items to determine X-columns
    // This avoids reliance on any specific row
    const timeItems = items.filter(it => isTime(it.str));
    // Use center of the item for X-coordinate
    const timeXCoords = timeItems.map(it => it.x + (it.w || 0) / 2);
    
    timeXCoords.sort((a, b) => a - b);

    const columnsX: number[] = [];
    if (timeXCoords.length > 0) {
        // Clustering: if diff > 15, new column
        let clusterSum = timeXCoords[0];
        let clusterCount = 1;
        let lastX = timeXCoords[0];

        for (let k = 1; k < timeXCoords.length; k++) {
            if (timeXCoords[k] - lastX > 15) { // Gap threshold
                columnsX.push(clusterSum / clusterCount);
                clusterSum = timeXCoords[k];
                clusterCount = 1;
            } else {
                clusterSum += timeXCoords[k];
                clusterCount++;
            }
            lastX = timeXCoords[k];
        }
        columnsX.push(clusterSum / clusterCount);
    }
    log(`Estimated Columns: ${columnsX.length}`);

    // Calculate dynamic search width based on column spacing
    let searchRadius = 25; // fallback default
    if (columnsX.length > 1) {
        const gaps = [];
        for(let i=1; i<columnsX.length; i++) gaps.push(columnsX[i] - columnsX[i-1]);
        const avgGap = gaps.reduce((a,b)=>a+b,0) / gaps.length;
        searchRadius = avgGap * 0.45; // Scan almost half the gap width to left/right
    }
    log(`Dynamic Search Radius: ${searchRadius.toFixed(2)}`);


    // 4. Employee Band Detection
    // Find all items that look like names on the far left
    // We treat them as Y-anchors.
    const potentialNames = items.filter(it => it.x < 100 && isLikelyName(it.str));
    
    // Sort logic handles Y descending, so potentialNames are ordered Top to Bottom.
    // However, sometimes multiple items might be close in Y (e.g. "Name" and "Title").
    // We'll trust our "LikelyName" filter to be specific enough.
    // Actually PDF order might not be strictly top-to-bottom if not sorted well, 
    // but we sorted items at step 1.
    
    // De-dupe names that are too close in Y (same line)
    const uniqueNameAnchors: ParsedItem[] = [];
    let lastY = -9999;
    for (const p of potentialNames) {
        if (Math.abs(p.y - lastY) > 8) { // If distinct vertical position
             uniqueNameAnchors.push(p);
             lastY = p.y;
        }
    }
    log(`Employee Anchors Found: ${uniqueNameAnchors.length}`);

    const shifts: ShiftEvent[] = [];
    const employees: string[] = [];

    // 5. Band Extraction Loop
    for (let i = 0; i < uniqueNameAnchors.length; i++) {
        const anchor = uniqueNameAnchors[i];
        const name = clean(anchor.str);
        employees.push(name);

        // Define Band Boundaries
        // Top: anchor.y + some buffer (upwards)
        // Bottom: Next Anchor Y (or end of page/arbitrary limit)
        // Note: Y is usually 0 at bottom in PDF, but pdf.js text content is often top-down? 
        // Wait, pdf.js standard coordinate system is Bottom-Left is (0,0). 
        // So Higher Y = Higher on page.
        // items.sort was (b.y - a.y) -> Descending Y -> Top to Bottom.
        
        const topY = anchor.y + 10; // Slightly above name
        const bottomY = (i + 1 < uniqueNameAnchors.length) 
            ? uniqueNameAnchors[i+1].y + 10 // Slightly above next name
            : 0; // Bottom of page

        // Filter items within this vertical band
        const bandItems = items.filter(it => it.y <= topY && it.y > bottomY);

        // Iterate Columns
        columnsX.forEach((colX, colIdx) => {
            const day = colIdx + 1;
            
            // Find items in this column within this band
            const cellItems = bandItems.filter(it => Math.abs((it.x + (it.w||0)/2) - colX) < searchRadius);

            if (cellItems.length === 0) return;

            // Sort top-to-bottom within cell
            cellItems.sort((a,b) => b.y - a.y);
            
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            let type = "";
            let start = "";
            let end = "";

            const allTexts = cellItems.map(it => clean(it.str));
            
            // Check for Holiday Keywords
            const typeKeywords = ["公", "休", "有", "希", "欠", "半", "遅", "早"];
            const foundType = allTexts.find(t => typeKeywords.some(k => t.includes(k)));

            if (foundType) {
                type = foundType;
            } else {
                // Check for Times
                const timeRegex = /\d{1,2}:\d{2}/g;
                const foundTimes: string[] = [];
                cellItems.forEach(it => {
                     const m = clean(it.str).match(timeRegex);
                     if (m) foundTimes.push(...m);
                });

                if (foundTimes.length > 0) {
                    type = "Shift";
                    start = foundTimes[0];
                    if (foundTimes.length > 1) {
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

    return {
        month: `${year}-${String(month).padStart(2, '0')}`,
        employees: Array.from(new Set(employees)),
        shifts,
        debugInfo: {
            totalItems: items.length,
            rowsDetected: uniqueNameAnchors.length, // Using anchors acts as rows
            yearMonthFound: `${year}-${month}`,
            dateRowIndex: -1,
            sampleRows: debugLogs.slice(0, 10)
        }
    };
}

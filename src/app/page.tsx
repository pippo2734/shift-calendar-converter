"use client";

import { useState } from "react";
import DropZone from "@/components/DropZone";
import { Calendar, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { parseShiftPdf } from "@/lib/pdf-parser";
import { ParseResult } from "@/types";
import ShiftEditor from "@/components/ShiftEditor";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);

  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    setIsProcessing(true);

    try {
      const result = await parseShiftPdf(selectedFile);
      setParseResult(result);
    } catch (error: any) {
      console.error("Parsing failed", error);
      alert(`Failed to parse PDF: ${error.message}`);
      setFile(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setParseResult(null);
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 md:p-12 relative overflow-hidden bg-slate-950">
      {/* Background Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-purple-600/20 rounded-full blur-[100px]" />
        <div className="absolute top-[20%] right-[10%] w-[30%] h-[30%] bg-blue-600/20 rounded-full blur-[100px]" />
        <div className="absolute -bottom-[10%] left-[20%] w-[50%] h-[50%] bg-cyan-600/10 rounded-full blur-[100px]" />
      </div>

      <div className="z-10 w-full flex flex-col items-center text-center space-y-8">

        <AnimatePresence mode="wait">
          {!parseResult ? (
            <motion.div
              key="upload"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5 }}
              className="w-full max-w-4xl space-y-8"
            >
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass text-sm font-medium text-cyan-200 mb-4">
                  <Calendar className="w-4 h-4" />
                  <span>Shift Schedule Converter</span>
                </div>

                <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-white mb-2">
                  Transform Your <br />
                  <span className="text-gradient">Shift PDF</span> to Calendar
                </h1>

                <p className="text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
                  Upload your shift schedule PDF and instantly get a calendar file compatible with Google Calendar, Apple Calendar, and Outlook.
                </p>
              </div>


              <div className="w-full flex flex-col items-center gap-4">
                <DropZone onFileSelect={handleFileSelect} isProcessing={isProcessing} />

                <button
                  onClick={() => handleFileSelect(new File([""], "demo.pdf", { type: "application/pdf" }))}
                  className="text-slate-500 hover:text-cyan-400 text-sm transition-colors flex items-center gap-1"
                >
                  <span>Don't have a file?</span>
                  <span className="underline decoration-dashed decoration-1 underline-offset-4">Try with demo data</span>
                </button>
              </div>
            </motion.div>
          ) : (
            <ShiftEditor key="editor" data={parseResult} onReset={handleReset} />
          )}
        </AnimatePresence>

      </div>
    </main>
  );
}

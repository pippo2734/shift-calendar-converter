"use client";

import { useCallback, useState } from "react";
import { Upload, FileText, CheckCircle, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { clsx } from "clsx";

interface DropZoneProps {
    onFileSelect: (file: File) => void;
    isProcessing?: boolean;
}

export default function DropZone({ onFileSelect, isProcessing }: DropZoneProps) {
    const [isDragOver, setIsDragOver] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
    }, []);

    const validateAndSelectFile = (file: File) => {
        if (file.type !== "application/pdf") {
            setError("PDFファイルをアップロードしてください。");
            return;
        }
        setError(null);
        onFileSelect(file);
    };

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            setIsDragOver(false);
            const file = e.dataTransfer.files[0];
            if (file) {
                validateAndSelectFile(file);
            }
        },
        [onFileSelect]
    );

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            validateAndSelectFile(file);
        }
    };

    return (
        <div className="w-full max-w-xl mx-auto">
            <motion.div
                layout
                className={clsx(
                    "relative border-2 border-dashed rounded-3xl p-12 transition-all duration-300 cursor-pointer overflow-hidden group",
                    isDragOver
                        ? "border-cyan-400 bg-cyan-400/10 scale-[1.02]"
                        : "border-slate-600 hover:border-slate-500 hover:bg-slate-800/50 bg-slate-900/40"
                )}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => document.getElementById("file-input")?.click()}
            >
                <input
                    type="file"
                    id="file-input"
                    className="hidden"
                    accept=".pdf"
                    onChange={handleFileInput}
                    disabled={isProcessing}
                />

                <div className="flex flex-col items-center justify-center text-center space-y-4">
                    <div className={clsx(
                        "p-4 rounded-full transition-colors duration-300",
                        isDragOver ? "bg-cyan-400/20 text-cyan-400" : "bg-slate-800 text-slate-400 group-hover:text-slate-200"
                    )}>
                        {isProcessing ? (
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                            >
                                <Upload className="w-8 h-8" />
                            </motion.div>
                        ) : (
                            <Upload className="w-8 h-8" />
                        )}
                    </div>

                    <div>
                        <h3 className="text-xl font-bold text-slate-200">
                            {isProcessing ? "処理中..." : "シフト表(PDF)を選択"}
                        </h3>
                        <p className="text-sm text-slate-400 mt-2">
                            ドラッグ＆ドロップ または クリックしてアップロード
                        </p>
                    </div>
                </div>
            </motion.div>

            <AnimatePresence>
                {error && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-200 text-sm flex items-center gap-2 justify-center"
                    >
                        <AlertCircle className="w-4 h-4" />
                        {error}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

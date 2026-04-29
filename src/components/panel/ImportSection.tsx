import { useState, type RefObject } from "react";
import { IconBolt, IconDocument, IconUpload, IconCheck } from "@/components/icons";
import type { ImportParseMode } from "@/lib/api/image-workflow.types";
import { formatFileSize } from "@/lib/format";

interface ImportSectionProps {
  importTab: "text" | "file";
  setImportTab: (tab: "text" | "file") => void;
  textInput: string;
  setTextInput: (v: string) => void;
  uploadFile: File | null;
  setUploadFile: (f: File | null) => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  dedupe: boolean;
  setDedupe: (v: boolean) => void;
  parseMode: ImportParseMode;
  setParseMode: (v: ImportParseMode) => void;
  parseLoading: boolean;
  onParseText: () => void;
  onParseFile: () => void;
}

const parseModeOptions: Array<{ value: ImportParseMode; label: string }> = [
  { value: "auto", label: "自动" },
  { value: "local", label: "本地" },
  { value: "claude", label: "Claude" },
];

export function ImportSection({
  importTab,
  setImportTab,
  textInput,
  setTextInput,
  uploadFile,
  setUploadFile,
  fileInputRef,
  dedupe,
  setDedupe,
  parseMode,
  setParseMode,
  parseLoading,
  onParseText,
  onParseFile,
}: ImportSectionProps) {
  const [dragActive, setDragActive] = useState(false);

  return (
    <div>
      <div className="grid grid-cols-2 gap-1 rounded-lg border border-white/10 bg-zinc-950 p-1" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={importTab === "text"}
          className={`h-9 rounded-md px-3 text-sm font-medium transition-colors ${
            importTab === "text"
              ? "bg-cyan-400 text-zinc-950"
              : "text-zinc-500 hover:bg-white/5 hover:text-zinc-200"
          }`}
          onClick={() => setImportTab("text")}
        >
          <span className="inline-flex items-center gap-1.5">
            <IconDocument className="h-3.5 w-3.5" />
            文本粘贴
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={importTab === "file"}
          className={`h-9 rounded-md px-3 text-sm font-medium transition-colors ${
            importTab === "file"
              ? "bg-cyan-400 text-zinc-950"
              : "text-zinc-500 hover:bg-white/5 hover:text-zinc-200"
          }`}
          onClick={() => setImportTab("file")}
        >
          <span className="inline-flex items-center gap-1.5">
            <IconUpload className="h-3.5 w-3.5" />
            文件上传
          </span>
        </button>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1 rounded-lg border border-white/10 bg-zinc-950 p-1">
        {parseModeOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`h-8 rounded-md px-2 text-xs font-medium transition-colors ${
              parseMode === option.value
                ? "bg-white text-zinc-950"
                : "text-zinc-500 hover:bg-white/5 hover:text-zinc-200"
            }`}
            onClick={() => setParseMode(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {importTab === "text" && (
        <div className="mt-3 space-y-2">
          <textarea
            className="min-h-32 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/10"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="粘贴角色描述、人设文本或提示词，支持多角色自动拆分"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-zinc-100 px-3 text-xs font-medium text-zinc-950 transition-colors hover:bg-white disabled:opacity-50"
              onClick={onParseText}
              disabled={parseLoading || !textInput.trim()}
            >
              <IconBolt className="h-3.5 w-3.5" />
              {parseLoading ? "提交中..." : "解析文本"}
            </button>
            <label className="inline-flex items-center gap-2 text-xs text-zinc-500">
              <input type="checkbox" checked={dedupe} onChange={(e) => setDedupe(e.target.checked)} className="rounded border-white/10 bg-zinc-900" />
              按最终 prompt 去重
            </label>
          </div>
        </div>
      )}

      {importTab === "file" && (
        <div className="mt-3 space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.docx,.md,.txt"
            onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
            className="hidden"
          />
          <div
            className={`relative flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors ${
              dragActive
                ? "border-cyan-400 bg-cyan-400/10"
                : uploadFile
                  ? "border-emerald-400/50 bg-emerald-400/10"
                  : "border-white/10 bg-zinc-950 hover:border-cyan-400/40 hover:bg-cyan-400/5"
            }`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              const file = e.dataTransfer.files[0];
              if (file) setUploadFile(file);
            }}
          >
            {uploadFile ? (
              <div className="flex flex-col items-center gap-2 text-center">
                <IconCheck className="h-8 w-8 text-emerald-300" />
                <div className="text-sm font-medium text-zinc-100">{uploadFile.name}</div>
                <div className="text-xs text-zinc-500">{formatFileSize(uploadFile.size)}</div>
                <button
                  type="button"
                  className="mt-1 text-xs text-rose-300 hover:text-rose-200"
                  onClick={(e) => {
                    e.stopPropagation();
                    setUploadFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                >
                  移除文件
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-center">
                <IconUpload className="h-8 w-8 text-zinc-500" />
                <div className="text-sm font-medium text-zinc-300">点击或拖拽文件</div>
                <div className="text-xs text-zinc-600">.csv / .xlsx / .docx / .md / .txt</div>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-zinc-100 px-3 text-xs font-medium text-zinc-950 transition-colors hover:bg-white disabled:opacity-50"
              onClick={onParseFile}
              disabled={parseLoading || !uploadFile}
            >
              <IconBolt className="h-3.5 w-3.5" />
              {parseLoading ? "提交中..." : "解析文件"}
            </button>
            <label className="inline-flex items-center gap-2 text-xs text-zinc-500">
              <input type="checkbox" checked={dedupe} onChange={(e) => setDedupe(e.target.checked)} className="rounded border-white/10 bg-zinc-900" />
              按最终 prompt 去重
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

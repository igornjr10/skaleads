import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Play, Image as ImageIcon, AlertTriangle } from "lucide-react";
import type { CreativeItem, FatigueStatus } from "@/lib/creative-analysis";

const FATIGUE_CONFIG: Record<FatigueStatus, { label: string; className: string }> = {
  NONE: { label: "", className: "" },
  MODERATE: { label: "Atenção", className: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  SEVERE: { label: "Fadiga", className: "bg-red-100 text-red-800 border-red-300" },
};

function fmtCurrency(v: number) {
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtPct(v: number) {
  return `${v.toFixed(2)}%`;
}

interface Props {
  creative: CreativeItem;
  onClick: () => void;
}

export function CreativeCard({ creative, onClick }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [thumbError, setThumbError] = useState(false);
  const fatigue = FATIGUE_CONFIG[creative.fatigueStatus];
  const isVideo = creative.creative_type === "video";
  const thumb = !thumbError ? (creative.thumbnail_url || creative.image_url) : null;

  return (
    <Card
      className="overflow-hidden cursor-pointer hover:shadow-md transition-shadow group"
      onClick={onClick}
    >
      {/* Thumbnail */}
      <div className="relative aspect-[4/3] bg-muted overflow-hidden">
        {thumb ? (
          <img
            src={thumb}
            alt={creative.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
            onError={() => setThumbError(true)}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <ImageIcon className="h-8 w-8 text-muted-foreground" />
          </div>
        )}

        {isVideo && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-black/40 rounded-full p-2 group-hover:bg-black/60 transition">
              <Play className="h-5 w-5 text-white fill-white" />
            </div>
          </div>
        )}

        {/* Fatigue badge overlay */}
        {creative.fatigueStatus !== "NONE" && (
          <div className="absolute top-2 right-2">
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${fatigue.className}`}>
              <AlertTriangle className="h-3 w-3" />
              {fatigue.label}
            </span>
          </div>
        )}

        {/* Status */}
        {creative.status !== "ACTIVE" && (
          <div className="absolute top-2 left-2">
            <Badge variant="secondary" className="text-[10px]">{creative.status}</Badge>
          </div>
        )}
      </div>

      <CardContent className="p-3 space-y-2">
        <p className="text-xs font-medium leading-tight line-clamp-2">{creative.name}</p>

        {creative.body && (
          <p className="text-[10px] text-muted-foreground line-clamp-2">{creative.body}</p>
        )}

        {/* Metrics grid */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 pt-1">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Investimento</p>
            <p className="text-xs font-semibold">{fmtCurrency(creative.spend)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">CTR</p>
            <p className="text-xs font-semibold">{fmtPct(creative.ctr)}</p>
          </div>
          {creative.cpa > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">CPA</p>
              <p className="text-xs font-semibold">{fmtCurrency(creative.cpa)}</p>
            </div>
          )}
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Frequência</p>
            <p className="text-xs font-semibold">{creative.frequency.toFixed(1)}</p>
          </div>
        </div>

        {/* Video metrics */}
        {isVideo && (creative.hookRate !== null || creative.holdRate !== null) && (
          <div className="grid grid-cols-2 gap-x-3 pt-1 border-t">
            {creative.hookRate !== null && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Hook rate</p>
                <p className="text-xs font-semibold">{fmtPct(creative.hookRate)}</p>
              </div>
            )}
            {creative.holdRate !== null && (
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Hold rate</p>
                <p className="text-xs font-semibold">{fmtPct(creative.holdRate)}</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

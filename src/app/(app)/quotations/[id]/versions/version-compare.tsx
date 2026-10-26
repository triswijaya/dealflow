"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDate, formatRupiah } from "@/lib/format";
import { QUOTATION_STATUS } from "@/lib/labels";
import type { QuotationVersionDto } from "@/server/quotations/quotation-views";

const FIELDS: { label: string; read: (version: QuotationVersionDto) => string }[] = [
  { label: "Tanggal terbit", read: (version) => formatDate(version.issueDate) },
  { label: "Berlaku sampai", read: (version) => formatDate(version.validUntil) },
  { label: "Total", read: (version) => formatRupiah(version.total) },
  { label: "Jumlah item", read: (version) => String(version.itemCount) },
];

/**
 * QUO-06: every version stays openable, and two of them can be compared on
 * number, dates, total and item count. Fields that differ are marked.
 */
export function VersionCompare({ versions }: { versions: QuotationVersionDto[] }) {
  // The two newest start selected: the usual question is "what changed in the last revision".
  const [selected, setSelected] = useState<string[]>(versions.slice(0, 2).map((version) => version.id));
  const [comparing, setComparing] = useState(false);

  const chosen = selected.map((id) => versions.find((version) => version.id === id)!).filter(Boolean);
  const ready = chosen.length === 2;

  function toggle(id: string) {
    setComparing(false);
    setSelected((current) => (current.includes(id) ? current.filter((candidate) => candidate !== id) : current.length >= 2 ? [current[1]!, id] : [...current, id]));
  }

  return (
    <>
      <div className="row between" style={{ marginBottom: 16 }}>
        <small>{ready ? "Dua versi dipilih." : "Pilih dua versi untuk dibandingkan."}</small>
        <span title={ready ? undefined : "Pilih dua versi terlebih dahulu."}>
          <Button variant="secondary" disabled={!ready} onClick={() => setComparing(true)}>
            Bandingkan
          </Button>
        </span>
      </div>

      {comparing && ready ? (
        <div className="cols g2" style={{ marginBottom: 20 }} id="bandingkan">
          {chosen.map((version, index) => (
            <Card key={version.id}>
              <h2>{version.quotationNumber}</h2>
              <dl>
                {FIELDS.map((field) => {
                  const value = field.read(version);
                  const other = field.read(chosen[1 - index]!);
                  return (
                    <div key={field.label} className="kv">
                      <dt>{field.label}</dt>
                      <dd>{value !== other ? <mark style={{ background: "var(--status-warning-soft)" }}>{value}</mark> : value}</dd>
                    </div>
                  );
                })}
              </dl>
            </Card>
          ))}
        </div>
      ) : null}

      <div className="stack">
        {versions.map((version) => {
          const info = QUOTATION_STATUS[version.status];
          return (
            <Card key={version.id}>
              <label className="row">
                <input type="checkbox" aria-label={`Pilih ${version.quotationNumber}`} checked={selected.includes(version.id)} onChange={() => toggle(version.id)} />
                <b>{version.quotationNumber}</b>
                <Badge tone={info?.tone}>{info?.label ?? version.status}</Badge>
                {version.isLatest ? <Badge>Terbaru</Badge> : <Badge tone="outline">Versi lama</Badge>}
              </label>
              <dl>
                <div className="kv">
                  <dt>Tanggal terbit</dt>
                  <dd>{formatDate(version.issueDate)}</dd>
                </div>
                <div className="kv">
                  <dt>Berlaku sampai</dt>
                  <dd>{formatDate(version.validUntil)}</dd>
                </div>
                <div className="kv">
                  <dt>Total</dt>
                  <dd>{formatRupiah(version.total)}</dd>
                </div>
                <div className="kv">
                  <dt>Dibuat oleh</dt>
                  <dd>{version.createdByName ?? "-"}</dd>
                </div>
                <div className="kv">
                  <dt>Asal revisi</dt>
                  <dd>{version.revisedFromNumber ? `Direvisi dari ${version.revisedFromNumber}` : "Versi awal"}</dd>
                </div>
              </dl>
              <Link className="btn tertiary" href={`/quotations/${version.id}`}>
                Buka
              </Link>
            </Card>
          );
        })}
      </div>
    </>
  );
}

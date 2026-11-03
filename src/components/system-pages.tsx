"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Brand } from "@/components/brand";
import { EmptyState } from "@/components/ui/misc";
import { authClient } from "@/lib/auth-client";

function SystemPage({
  title,
  description,
  children,
  footnote,
  showBrand = true,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footnote?: string;
  showBrand?: boolean;
}) {
  return (
    <div style={{ maxWidth: 570, margin: "0 auto", padding: "70px 16px" }}>
      {showBrand ? <Brand href="/dashboard" /> : null}
      <div style={{ marginTop: showBrand ? 40 : 0 }}>
        <EmptyState title={title} description={description} action={children} />
      </div>
      {footnote ? (
        <p className="muted" style={{ textAlign: "center", marginTop: 18 }}>
          {footnote}
        </p>
      ) : null}
    </div>
  );
}

// TENANT-04: one wording for "missing" and "another organization's", so the
// page never confirms that a record exists somewhere.
export function NotFoundContent({ showBrand }: { showBrand?: boolean }) {
  return (
    <SystemPage
      title="Halaman tidak ditemukan"
      description="Data mungkin sudah tidak ada atau Anda tidak memiliki akses."
      showBrand={showBrand}
    >
      <Link className="btn primary" href="/dashboard">
        Kembali ke Ringkasan
      </Link>
    </SystemPage>
  );
}

export function ForbiddenContent({ showBrand }: { showBrand?: boolean }) {
  return (
    <SystemPage
      title="Anda tidak memiliki akses ke halaman ini"
      description="Hubungi admin organisasi bila Anda memerlukan akses."
      showBrand={showBrand}
    >
      <Link className="btn primary" href="/dashboard">
        Kembali ke Ringkasan
      </Link>
    </SystemPage>
  );
}

export function ErrorContent({ reference, onRetry }: { reference?: string; onRetry: () => void }) {
  return (
    <SystemPage
      title="Terjadi kesalahan"
      description="Coba lagi dalam beberapa saat."
      footnote={reference ? `Ref: ${reference}` : undefined}
      showBrand={false}
    >
      <button type="button" className="btn primary" onClick={onRetry}>
        Coba lagi
      </button>
      <Link className="btn tertiary" href="/dashboard">
        Kembali ke Ringkasan
      </Link>
    </SystemPage>
  );
}

export function AccessRevoked() {
  const router = useRouter();
  return (
    <SystemPage title="Akses Anda sudah dinonaktifkan oleh admin." description="Hubungi admin organisasi untuk informasi akses.">
      <button
        type="button"
        className="btn primary"
        onClick={() =>
          authClient.signOut({
            fetchOptions: {
              onSuccess: () => {
                router.push("/login");
                router.refresh();
              },
            },
          })
        }
      >
        Keluar
      </button>
    </SystemPage>
  );
}

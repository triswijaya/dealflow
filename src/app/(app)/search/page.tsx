import type { Metadata } from "next";
import { SearchGroups, hasResults } from "@/components/domain/search-results";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Field, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { one } from "@/lib/url";
import { globalSearch, MAX_QUERY_LENGTH, MIN_QUERY_LENGTH } from "@/server/search/search";
import { load, requireWorkspace } from "../workspace";

export const metadata: Metadata = { title: "Pencarian · DealFlow" };

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  await requireWorkspace();
  const query = (one((await searchParams).q) ?? "").trim().slice(0, MAX_QUERY_LENGTH);
  const results = await load((headers) => globalSearch({ headers, query, limit: 20 }));
  const looksLikePhone = /^[0-9+()\-.\s]{6,}$/.test(query);

  return (
    <>
      <PageHeader title="Hasil pencarian" description={query.length >= MIN_QUERY_LENGTH ? `Hasil untuk “${query}”` : "Temukan customer, deal, dan dokumen organisasi."} />
      <Card>
        <form action="/search" role="search" className="row" style={{ alignItems: "flex-end", flexWrap: "nowrap" }}>
          <div style={{ flex: 1 }}>
            <Field label="Cari customer, deal, nomor quotation atau invoice" htmlFor="search-page-q">
              <Input id="search-page-q" name="q" type="search" defaultValue={query} maxLength={MAX_QUERY_LENGTH} autoComplete="off" />
            </Field>
          </div>
          <Button type="submit">Cari</Button>
        </form>

        {!results.searched ? (
          <p className="muted" style={{ marginTop: 16 }}>
            Ketik minimal {MIN_QUERY_LENGTH} karakter untuk mencari.
          </p>
        ) : hasResults(results) ? (
          <div style={{ marginTop: 8 }}>
            <SearchGroups results={results} />
            {looksLikePhone && results.customers.length > 0 ? <Alert tone="info" className="mt">Pencarian nomor telepon mencocokkan format 08xx dan +62 ke customer yang sama.</Alert> : null}
          </div>
        ) : (
          <EmptyState title={`Tidak ditemukan hasil untuk '${query}'`} description="Cek ejaan atau coba kata yang lebih singkat." />
        )}
      </Card>
    </>
  );
}

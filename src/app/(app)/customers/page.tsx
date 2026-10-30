import { Building2, MessageCircle, SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { isBuilt } from "@/components/app-shell/nav";
import { ButtonLink, IconLink } from "@/components/ui/button";
import { PageHeader, EmptyState } from "@/components/ui/misc";
import { Pagination } from "@/components/ui/pagination";
import { formatDate, formatPhone } from "@/lib/format";
import { one, positiveInt } from "@/lib/url";
import { listCustomers, type CustomerListItemDto } from "@/server/customers/customers";
import { load, requireWorkspace } from "../workspace";
import { CustomerRowActions, NewCustomerButton } from "./customer-actions";
import { CustomerToolbar } from "./customer-toolbar";

export const metadata: Metadata = { title: "Customer · DealFlow" };

const PAGE_SIZES = [25, 50, 100];

function editable(customer: CustomerListItemDto) {
  return {
    id: customer.id,
    version: customer.version,
    companyName: customer.companyName,
    taxId: customer.taxId,
    contactPerson: customer.contactPerson,
    phoneRaw: customer.phoneRaw,
    email: customer.email,
    address: customer.address,
    notes: customer.notes,
  };
}

export default async function CustomersPage({ searchParams }: PageProps<"/customers">) {
  const workspace = await requireWorkspace();
  const params = await searchParams;
  const query = (one(params.q) ?? "").trim().slice(0, 200);
  const sort = one(params.sort) === "name" ? "name" : "newest";
  const pageSize = positiveInt(one(params.pageSize));

  const result = await load((headers) =>
    listCustomers({
      headers,
      query,
      sort,
      page: positiveInt(one(params.page)),
      pageSize: pageSize && PAGE_SIZES.includes(pageSize) ? pageSize : undefined,
    }),
  );

  const finance = workspace.role === "FINANCE";
  const canWrite = !finance;
  const dealsReady = isBuilt("/deals");
  const filtered = query.length > 0;

  return (
    <>
      <PageHeader
        title="Customer"
        description="Semua calon dan pelanggan organisasi Anda."
        actions={canWrite ? <NewCustomerButton /> : undefined}
      />
      {/* Nothing to search yet on a first run: the empty state says what to do first. */}
      {filtered || result.totalItems > 0 ? <CustomerToolbar query={query} sort={sort} /> : null}

      {result.items.length === 0 ? (
        filtered || result.totalItems > 0 ? (
          <EmptyState
            icon={SearchX}
            title="Tidak ada hasil untuk filter ini"
            description="Coba ubah kata pencarian atau pilihan filter."
            action={
              <ButtonLink variant="tertiary" href="/customers">
                Reset filter
              </ButtonLink>
            }
          />
        ) : (
          <EmptyState
            icon={Building2}
            title="Belum ada customer"
            description={canWrite ? "Tambahkan customer pertama untuk mulai membuat deal." : "Customer akan muncul di sini setelah tim sales menambahkannya."}
            action={canWrite ? <NewCustomerButton>Tambah customer</NewCustomerButton> : undefined}
          />
        )
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nama perusahaan</th>
                <th>Kontak</th>
                <th>Telepon</th>
                {finance ? <th>Deal menang</th> : <th>Deal aktif</th>}
                {finance ? null : <th className="num">Total deal</th>}
                <th>Dibuat</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((customer) => (
                <tr key={customer.id}>
                  <td data-label="Nama perusahaan">
                    <div>
                      <b>
                        <Link href={`/customers/${customer.id}`}>{customer.companyName}</Link>
                      </b>
                      {customer.email ? <small>{customer.email}</small> : null}
                    </div>
                  </td>
                  <td data-label="Kontak">
                    <div>{customer.contactPerson}</div>
                  </td>
                  <td data-label="Telepon">
                    <div>
                      {formatPhone(customer.phoneNormalized)}{" "}
                      {customer.phoneNormalized ? (
                        <IconLink
                          label="Buka WhatsApp"
                          href={`https://wa.me/${customer.phoneNormalized}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <MessageCircle aria-hidden="true" />
                        </IconLink>
                      ) : null}
                    </div>
                  </td>
                  {finance ? (
                    <td data-label="Deal menang">
                      <div>{customer.wonDeals}</div>
                    </td>
                  ) : (
                    <>
                      <td data-label="Deal aktif">
                        <div>{customer.activeDeals}</div>
                      </td>
                      <td className="num" data-label="Total deal">
                        <div>{customer.totalDeals}</div>
                      </td>
                    </>
                  )}
                  <td data-label="Dibuat">
                    <div>{formatDate(customer.createdAt, workspace.timezone)}</div>
                  </td>
                  <td data-label="Aksi">
                    <div>
                      {canWrite ? (
                        <CustomerRowActions customer={editable(customer)} dealsReady={dealsReady} />
                      ) : (
                        <ButtonLink variant="tertiary" href={`/customers/${customer.id}`}>
                          Lihat detail
                        </ButtonLink>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={result.page} pageSize={result.pageSize} totalItems={result.totalItems} totalPages={result.totalPages} />
        </div>
      )}
    </>
  );
}

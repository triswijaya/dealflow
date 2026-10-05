import { useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "./landing-icon";
import type { CSSVars } from "./landing-hooks";

type Access = "full" | "read" | "won" | "none";

const ACCESS_LABEL: Record<Access, { icon: "check" | "eye" | "lock"; text: string }> = {
  full: { icon: "check", text: "Kelola" },
  read: { icon: "eye", text: "Lihat" },
  won: { icon: "eye", text: "Hanya deal Menang" },
  none: { icon: "lock", text: "Tanpa akses" },
};

const MODULES = [
  { name: "Customer", icon: "users" },
  { name: "Pipeline & deal", icon: "brand" },
  { name: "Quotation", icon: "fileText" },
  { name: "Follow-up", icon: "calendar" },
  { name: "Invoice", icon: "receipt" },
  { name: "Pembayaran", icon: "wallet" },
  { name: "Anggota & pengaturan", icon: "settings" },
] as const;

// Mirrors the permission matrix in requirement.md section 6.2.
const ROLES: Array<{ id: string; label: string; summary: string; scope: string; access: Access[] }> = [
  {
    id: "owner",
    label: "Owner & Admin",
    summary: "Melihat keseluruhan alur, mengelola anggota, dan mengatur profil perusahaan.",
    scope: "Gambaran bisnis & pengelolaan tim",
    access: ["full", "full", "full", "full", "full", "full", "full"],
  },
  {
    id: "sales",
    label: "Sales",
    summary: "Mengelola customer, deal, quotation, dan follow-up tanpa akses ke invoice atau pembayaran.",
    scope: "Peluang & percakapan customer",
    access: ["full", "full", "full", "full", "none", "none", "none"],
  },
  {
    id: "finance",
    label: "Finance",
    summary: "Melihat deal Menang, menerbitkan invoice, dan mencatat pembayaran.",
    scope: "Tagihan & penerimaan pembayaran",
    access: ["read", "won", "won", "none", "full", "full", "none"],
  },
];

/** Role picker that shows which modules each role can open. */
export function RoleSwitcher() {
  const [active, setActive] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const role = ROLES[active];

  function select(index: number, focus = false) {
    const next = (index + ROLES.length) % ROLES.length;
    setActive(next);
    if (focus) tabRefs.current[next]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const target = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: ROLES.length - 1 }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    select(target, true);
  }

  return (
    <div className="lp-role-board">
      <div className="lp-role-board-header">
        <span>Akses sesuai peran</span>
        <Icon name="lock" />
      </div>
      <div className="lp-seg" role="tablist" aria-label="Pilih peran" style={{ "--i": active } as CSSVars}>
        <span className="lp-seg-thumb" aria-hidden="true" />
        {ROLES.map((item, index) => (
          <button
            key={item.id}
            ref={(el) => {
              tabRefs.current[index] = el;
            }}
            type="button"
            role="tab"
            id={`role-tab-${item.id}`}
            aria-selected={active === index}
            aria-controls="role-panel"
            tabIndex={active === index ? 0 : -1}
            onClick={() => select(index)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div id="role-panel" role="tabpanel" aria-labelledby={`role-tab-${role.id}`}>
        <div className="lp-role-summary">
          <p>{role.summary}</p>
          <span className="lp-scope">{role.scope}</span>
        </div>
        <ul className="lp-mods">
          {MODULES.map((module, index) => {
            const access = role.access[index];
            const label = ACCESS_LABEL[access];
            return (
              <li key={module.name} data-access={access} style={{ "--d": index } as CSSVars}>
                <span className="lp-mod-icon">
                  <Icon name={module.icon} />
                </span>
                {module.name}
                <span className="lp-mod-state">
                  <Icon name={label.icon} />
                  {label.text}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

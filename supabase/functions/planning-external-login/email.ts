const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c));
export function planningAccessEmail(input: { name: string; project: string; type: string; token: string }) {
  const role = input.type === "customer" ? "Kunde" : "Leverandør / samarbeidspartner";
  return {
    subject: `MCS Hub – din tilgangslenke`,
    html: `<h1>MCS Hub</h1><p>Hei ${escape(input.name)},</p><p>Her er en ny tilgangslenke til dine prosjekter i MCS Hub. På <strong>${escape(input.project)}</strong> er du <strong>${role}</strong>.</p><p><a href="https://mcsressurs.lovable.app/ekstern#access=${encodeURIComponent(input.token)}">Åpne mine prosjekter</a></p><p>Du ser bare prosjekter du er invitert til og innhold som er delt med deg. Du får ingen tilgang til interne MCS-moduler. Rollen og tilgangen gjelder separat for hvert prosjekt.</p><p>Lenken er personlig, gjelder i 48 timer og kan brukes én gang. Ikke videresend den. Du kan alltid be om en ny lenke på mcsressurs.lovable.app/ekstern.</p>`,
  };
}
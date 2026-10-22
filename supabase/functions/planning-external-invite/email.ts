const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c));
export function planningInviteEmail(input: { name: string; project: string; inviter: string; type: string; token: string; projectId: string }) {
  const role = input.type === "customer" ? "Kunde" : "Leverandør / samarbeidspartner";
  const link = `https://mcsressurs.lovable.app/planlegging/ekstern/${input.projectId}#invite=${input.token}`;
  return {
    subject: `MCS Hub – invitasjon til ${input.project}`,
    html: `<h1>MCS Hub</h1><p>Hei ${escape(input.name)},</p><p>${escape(input.inviter)} inviterer deg til prosjektet <strong>${escape(input.project)}</strong> som <strong>${role}</strong>.</p><p>Tilgangen gjelder kun dette prosjektet: prosjektoversikten, samtalene ${input.type === "customer" ? "Kunde" : "Leverandør"} og Alle, og arbeidspakker, oppgaver og filer som MCS uttrykkelig deler med deg. Du ser bare meldinger hvor du er valgt som mottaker.</p><p>Du får ikke tilgang til Intern plan, andre prosjekter, Ressursplan, kunder, ansatte, HMS eller intern økonomi.</p><p><a href="${escape(link)}">Godta invitasjonen og åpne prosjektrommet</a></p><p>Lenken er personlig, gyldig i 48 timer og kan brukes én gang. Ikke videresend den. MCS kan avslutte tilgangen når som helst.</p>`,
  };
}
# Person-/selskapsdiff – IKKE AKTIVERT

Snapshot: 2026-11-09T07:02:43.431336+00:00

FØR er faktisk lagret tilstand. ETTER er mål/diff, ikke innført. Ingen tildelinger eller operative rettigheter endret denne runden.

## Hans Jakob Risnes
Konto: `8e8f360c-5299-4065-90fd-484bac6c575a`. Aktiv/verifisert: True/True.
- Legacy roller: ingen
- Aktive selskaper: BusBar AS
- V2-roller: Prosjektleder [global], Planlegger/Admin [global]
- Eksplisitte systemnøkler som må skilles fra drift: admin.data_integrity, admin.manage_companies, admin.manage_departments, admin.manage_roles, admin.manage_settings, admin.manage_users, module.admin, security.manage, security.view
### MCS Service AS
- FØR: aktivt medlem=False; legacy is_admin gir global bypass også uten medlemskap.
- ETTER: Ingen generell selskapsadmin; legitim eksplisitt prosjekttilgang beholdes.
### MCS Elektrotavler AS
- FØR: aktivt medlem=False; legacy is_admin gir global bypass også uten medlemskap.
- ETTER: Ingen generell selskapsadmin; legitim eksplisitt prosjekttilgang beholdes.
### BusBar AS
- FØR: aktivt medlem=True; legacy is_admin gir global bypass også uten medlemskap.
- ETTER: Operative roller beholdes; ingen automatisk selskapsadmin.
- Bevarte scoped overstyringer: regulation.review=allow, task_thread.email_external=allow
- Operative permission-nøkler som ikke fjernes i dette steget: absence.approve, absence.create_for_others, absence.create_self, absence.view_company, absence.view_team, calc.edit, calc.view, calculations.ai_generate, calculations.create, calculations.create_offer, calculations.edit, calendar.delete_events, calendar.read_busy, calendar.view_external, calendar.write_events, change_orders.cancel, change_orders.create, change_orders.mark_invoiced, change_orders.send, comm.create_note, comm.delete_note, comm.view, contracts.admin, contracts.analyze, contracts.create, contracts.edit, contracts.read, contracts.upload_document, data.delete, docs.delete, docs.upload, docs.view, documents.analyze, documents.delete, documents.upload, jobs.archive, jobs.assign_users, jobs.create, jobs.delete, jobs.edit, jobs.view, jobs.view_pricing, leads.convert, leads.create, leads.edit, leads.manage_participants, leads.transfer_owner, leads.view, module.absence, module.calendar, module.communication, module.contracts, module.customers, module.documents, module.inbox, module.invoice_basis, module.leads, module.management, module.overview, module.projects, module.resource_plan, module.sales, module.sharepoint, offers.archive, offers.create, offers.delete, offers.edit, offers.view, postkontor.admin, postkontor.view, projects.delete_attachment, projects.edit_plan, regulation.review, resourceplan.edit_others, resourceplan.schedule, resourceplan.view, resourceplan.view_busy, resourceplan.view_external_blocks, resourceplan.view_external_details, resourceplan.view_external_titles, scope.view.company, sharepoint.delete, sharepoint.link_job, sharepoint.upload, sharepoint.view, task_thread.comment_internal, task_thread.email_external, task_thread.manage, task_thread.upload_attachments, task_thread.view

## John Aleksander Mandt
Konto: `ca705be7-d75d-47e0-8848-fcf7f45a2613`. Aktiv/verifisert: True/True.
- Legacy roller: admin
- Aktive selskaper: MCS Service AS
- V2-roller: Prosjektleder [global], Planlegger/Admin [global]
- Eksplisitte systemnøkler som må skilles fra drift: admin.data_integrity, admin.manage_companies, admin.manage_departments, admin.manage_roles, admin.manage_settings, admin.manage_users, module.admin, security.manage, security.view
### MCS Service AS
- FØR: aktivt medlem=True; legacy is_admin gir global bypass også uten medlemskap.
- ETTER: Operative roller beholdes; ingen automatisk selskapsadmin.
### MCS Elektrotavler AS
- FØR: aktivt medlem=False; legacy is_admin gir global bypass også uten medlemskap.
- ETTER: Ingen generell selskapsadmin; legitim eksplisitt prosjekttilgang beholdes.
### BusBar AS
- FØR: aktivt medlem=False; legacy is_admin gir global bypass også uten medlemskap.
- ETTER: Ingen generell selskapsadmin; legitim eksplisitt prosjekttilgang beholdes.
- Operative permission-nøkler som ikke fjernes i dette steget: absence.approve, absence.create_for_others, absence.create_self, absence.view_company, absence.view_team, calc.edit, calc.view, calculations.ai_generate, calculations.create, calculations.create_offer, calculations.edit, calendar.delete_events, calendar.read_busy, calendar.view_external, calendar.write_events, change_orders.cancel, change_orders.create, change_orders.mark_invoiced, change_orders.send, comm.create_note, comm.delete_note, comm.view, contracts.admin, contracts.analyze, contracts.create, contracts.edit, contracts.read, contracts.upload_document, data.delete, docs.delete, docs.upload, docs.view, documents.analyze, documents.delete, documents.upload, jobs.archive, jobs.assign_users, jobs.create, jobs.delete, jobs.edit, jobs.view, jobs.view_pricing, leads.convert, leads.create, leads.create_meeting, leads.edit, leads.email_draft, leads.manage_participants, leads.transfer_owner, leads.view, module.absence, module.calendar, module.communication, module.contracts, module.customers, module.documents, module.inbox, module.invoice_basis, module.leads, module.management, module.overview, module.projects, module.resource_plan, module.sales, module.sharepoint, offers.archive, offers.create, offers.delete, offers.edit, offers.view, postkontor.admin, postkontor.view, projects.delete_attachment, projects.edit_plan, regulation.review, resourceplan.edit_others, resourceplan.schedule, resourceplan.view, resourceplan.view_busy, resourceplan.view_external_blocks, resourceplan.view_external_details, resourceplan.view_external_titles, scope.view.company, sharepoint.delete, sharepoint.link_job, sharepoint.upload, sharepoint.view, task_thread.comment_internal, task_thread.manage, task_thread.upload_attachments, task_thread.view

## Lars Erik Huseby
Konto: `a76694bd-e1b5-42c3-8523-4fc2a39e040f`. Aktiv/verifisert: True/True.
- Legacy roller: montør
- Aktive selskaper: BusBar AS
- V2-roller: Prosjektleder [global], Planlegger/Admin [global]
- Eksplisitte systemnøkler som må skilles fra drift: admin.data_integrity, admin.manage_companies, admin.manage_departments, admin.manage_roles, admin.manage_settings, admin.manage_users, module.admin, security.manage, security.view
### MCS Service AS
- FØR: aktivt medlem=False; legacy is_admin gir global bypass også uten medlemskap.
- ETTER: Ingen generell selskapsadmin; legitim eksplisitt prosjekttilgang beholdes.
### MCS Elektrotavler AS
- FØR: aktivt medlem=False; legacy is_admin gir global bypass også uten medlemskap.
- ETTER: Ingen generell selskapsadmin; legitim eksplisitt prosjekttilgang beholdes.
### BusBar AS
- FØR: aktivt medlem=True; legacy is_admin gir global bypass også uten medlemskap.
- ETTER: Operative roller beholdes; ingen automatisk selskapsadmin.
- Operative permission-nøkler som ikke fjernes i dette steget: absence.approve, absence.create_for_others, absence.create_self, absence.view_company, absence.view_team, calc.edit, calc.view, calculations.ai_generate, calculations.create, calculations.create_offer, calculations.edit, calendar.delete_events, calendar.read_busy, calendar.view_external, calendar.write_events, change_orders.cancel, change_orders.create, change_orders.mark_invoiced, change_orders.send, comm.create_note, comm.delete_note, comm.view, contracts.admin, contracts.analyze, contracts.create, contracts.edit, contracts.read, contracts.upload_document, data.delete, docs.delete, docs.upload, docs.view, documents.analyze, documents.delete, documents.upload, jobs.archive, jobs.assign_users, jobs.create, jobs.delete, jobs.edit, jobs.view, jobs.view_pricing, leads.convert, leads.create, leads.edit, leads.manage_participants, leads.transfer_owner, leads.view, module.absence, module.calendar, module.communication, module.contracts, module.customers, module.documents, module.inbox, module.invoice_basis, module.leads, module.management, module.overview, module.projects, module.resource_plan, module.sales, module.sharepoint, offers.archive, offers.create, offers.delete, offers.edit, offers.view, postkontor.admin, postkontor.view, projects.delete_attachment, projects.edit_plan, resourceplan.edit_others, resourceplan.schedule, resourceplan.view, resourceplan.view_busy, resourceplan.view_external_blocks, resourceplan.view_external_details, resourceplan.view_external_titles, scope.view.company, sharepoint.delete, sharepoint.link_job, sharepoint.upload, sharepoint.view, task_thread.comment_internal, task_thread.manage, task_thread.upload_attachments, task_thread.view

## Mats Lien Hansen
Konto: `6f2823df-7944-4fd1-bab0-95fe08d0a61e`. Aktiv/verifisert: True/True.
- Legacy roller: admin
- Aktive selskaper: MCS Service AS
- V2-roller: Prosjektleder [global], Planlegger/Admin [global]
- Eksplisitte systemnøkler som må skilles fra drift: admin.data_integrity, admin.manage_companies, admin.manage_departments, admin.manage_roles, admin.manage_settings, admin.manage_users, module.admin, security.manage, security.view
### MCS Service AS
- FØR: aktivt medlem=True; legacy is_admin gir global bypass også uten medlemskap.
- ETTER: Operative roller beholdes; ingen automatisk selskapsadmin.
### MCS Elektrotavler AS
- FØR: aktivt medlem=False; legacy is_admin gir global bypass også uten medlemskap.
- ETTER: Ingen generell selskapsadmin; legitim eksplisitt prosjekttilgang beholdes.
### BusBar AS
- FØR: aktivt medlem=False; legacy is_admin gir global bypass også uten medlemskap.
- ETTER: Ingen generell selskapsadmin; legitim eksplisitt prosjekttilgang beholdes.
- Operative permission-nøkler som ikke fjernes i dette steget: absence.approve, absence.create_for_others, absence.create_self, absence.view_company, absence.view_team, calc.edit, calc.view, calculations.ai_generate, calculations.create, calculations.create_offer, calculations.edit, calendar.delete_events, calendar.read_busy, calendar.view_external, calendar.write_events, change_orders.cancel, change_orders.create, change_orders.mark_invoiced, change_orders.send, comm.create_note, comm.delete_note, comm.view, contracts.admin, contracts.analyze, contracts.create, contracts.edit, contracts.read, contracts.upload_document, data.delete, docs.delete, docs.upload, docs.view, documents.analyze, documents.delete, documents.upload, jobs.archive, jobs.assign_users, jobs.create, jobs.delete, jobs.edit, jobs.view, jobs.view_pricing, leads.convert, leads.create, leads.edit, leads.manage_participants, leads.transfer_owner, leads.view, module.absence, module.calendar, module.communication, module.contracts, module.customers, module.documents, module.inbox, module.invoice_basis, module.leads, module.management, module.overview, module.projects, module.resource_plan, module.sales, module.sharepoint, offers.archive, offers.create, offers.delete, offers.edit, offers.view, postkontor.admin, postkontor.view, projects.delete_attachment, projects.edit_plan, regulation.review, resourceplan.edit_others, resourceplan.schedule, resourceplan.view, resourceplan.view_busy, resourceplan.view_external_blocks, resourceplan.view_external_details, resourceplan.view_external_titles, scope.view.company, sharepoint.delete, sharepoint.link_job, sharepoint.upload, sharepoint.view, task_thread.comment_internal, task_thread.manage, task_thread.upload_attachments, task_thread.view

## Rune Ørbeck
Konto: `31868e90-61d7-4f27-8493-0b1b7cbc5ef7`. Aktiv/verifisert: True/True.
- Legacy roller: ingen
- Aktive selskaper: MCS Service AS
- V2-roller: 
- Eksplisitte systemnøkler som må skilles fra drift: admin.manage_companies, admin.manage_users
### MCS Service AS
- FØR: aktivt medlem=True; legacy is_admin gir global bypass også uten medlemskap.
- ETTER: Full operativ selskapsadmin + bestillingsansvar og varsling beholdes; ingen global tilgangsstyring.
- Bevarte scoped overstyringer: hms.view=allow, hms.manage=allow, module.hms=allow, jobs.view_pricing=allow, orders.intake=allow
### MCS Elektrotavler AS
- FØR: aktivt medlem=False; legacy is_admin gir global bypass også uten medlemskap.
- ETTER: Ingen selskapsadmin; global legacy-bypass fjernes senere. Operative globale overrides må få kontrollert scope.
### BusBar AS
- FØR: aktivt medlem=False; legacy is_admin gir global bypass også uten medlemskap.
- ETTER: Ingen selskapsadmin; global legacy-bypass fjernes senere. Operative globale overrides må få kontrollert scope.
- Operative permission-nøkler som ikke fjernes i dette steget: absence.approve, absence.create_for_others, absence.create_self, absence.view_company, absence.view_team, calendar.delete_events, calendar.read_busy, calendar.write_events, comm.create_note, comm.delete_note, comm.restrict_to_participants, comm.view, contracts.admin, contracts.edit, contracts.read, docs.delete, docs.restrict_to_participants, docs.upload, docs.view, hms.manage, hms.view, jobs.archive, jobs.assign_users, jobs.create, jobs.delete, jobs.edit, jobs.view, jobs.view_pricing, module.hms, offers.archive, offers.create, offers.delete, offers.edit, offers.view, orders.intake, postkontor.admin, postkontor.view, regulation.review, resourceplan.edit_others, resourceplan.schedule, resourceplan.view, resourceplan.view_busy, resourceplan.view_external_blocks, sharepoint.admin, sharepoint.link_job, sharepoint.upload, sharepoint.view, task_thread.comment_internal, task_thread.email_external, task_thread.manage, task_thread.upload_attachments, task_thread.view

## Simen Kjeksli
Konto: `9ee227c5-7cc0-409a-93aa-1ef0696d27ca`. Aktiv/verifisert: True/True.
- Legacy roller: admin
- Aktive selskaper: MCS Elektrotavler AS
- V2-roller: Superadmin [global], Planlegger/Admin [global]
- Eksplisitte systemnøkler som må skilles fra drift: admin.data_integrity, admin.manage_companies, admin.manage_departments, admin.manage_roles, admin.manage_settings, admin.manage_users, module.admin, security.manage, security.view
### MCS Service AS
- FØR: aktivt medlem=False; legacy is_admin gir global bypass også uten medlemskap.
- ETTER: Global superadmin etter separat godkjenning: legg til én user_roles(super_admin)-rad; behold admin og alle andre rader i første steg.
### MCS Elektrotavler AS
- FØR: aktivt medlem=True; legacy is_admin gir global bypass også uten medlemskap.
- ETTER: Global superadmin etter separat godkjenning: legg til én user_roles(super_admin)-rad; behold admin og alle andre rader i første steg.
### BusBar AS
- FØR: aktivt medlem=False; legacy is_admin gir global bypass også uten medlemskap.
- ETTER: Global superadmin etter separat godkjenning: legg til én user_roles(super_admin)-rad; behold admin og alle andre rader i første steg.
- Operative permission-nøkler som ikke fjernes i dette steget: absence.approve, absence.create_for_others, absence.create_self, absence.view_company, absence.view_team, calc.edit, calc.view, calculations.ai_generate, calculations.create, calculations.create_offer, calculations.edit, calendar.delete_events, calendar.read_busy, calendar.view_external, calendar.write_events, change_orders.cancel, change_orders.create, change_orders.mark_invoiced, change_orders.send, comm.create_note, comm.delete_note, comm.view, contracts.admin, contracts.analyze, contracts.create, contracts.edit, contracts.read, contracts.upload_document, data.delete, docs.delete, docs.upload, docs.view, documents.analyze, documents.delete, documents.upload, jobs.archive, jobs.assign_users, jobs.create, jobs.delete, jobs.edit, jobs.view, jobs.view_pricing, leads.convert, leads.create, leads.create_meeting, leads.edit, leads.email_draft, leads.manage_participants, leads.transfer_owner, leads.view, module.absence, module.calendar, module.communication, module.contracts, module.customers, module.documents, module.fag, module.inbox, module.invoice_basis, module.leads, module.management, module.overview, module.projects, module.resource_plan, module.sales, module.sharepoint, offers.archive, offers.create, offers.delete, offers.edit, offers.view, postkontor.admin, postkontor.view, projects.delete_attachment, projects.edit_plan, regulation.review, resourceplan.cross_company, resourceplan.edit_others, resourceplan.schedule, resourceplan.view, resourceplan.view_busy, resourceplan.view_external_blocks, resourceplan.view_external_details, resourceplan.view_external_titles, scope.view.all, scope.view.company, security.audit.view, security.export, security.sensitive.view, sharepoint.admin, sharepoint.delete, sharepoint.link_job, sharepoint.upload, sharepoint.view, task_thread.comment_internal, task_thread.email_external, task_thread.manage, task_thread.upload_attachments, task_thread.view

## Sindre Ulriksen
Konto: `9138ec02-d2fd-446b-a651-2c743a3d9858`. Aktiv/verifisert: True/True.
- Legacy roller: admin
- Aktive selskaper: BusBar AS, MCS Elektrotavler AS, MCS Service AS
- V2-roller: Prosjektleder [global], Planlegger/Admin [global]
- Eksplisitte systemnøkler som må skilles fra drift: admin.data_integrity, admin.manage_companies, admin.manage_departments, admin.manage_roles, admin.manage_settings, admin.manage_users, module.admin, security.manage, security.view
### MCS Service AS
- FØR: aktivt medlem=True; legacy is_admin gir global bypass også uten medlemskap.
- ETTER: Operativ prosjektleder/planlegger, ingen selskapsadmin; konkrete policyavhengige CRUD-rettigheter avklares.
### MCS Elektrotavler AS
- FØR: aktivt medlem=True; legacy is_admin gir global bypass også uten medlemskap.
- ETTER: Operativ prosjektleder/planlegger, ingen selskapsadmin; konkrete policyavhengige CRUD-rettigheter avklares.
### BusBar AS
- FØR: aktivt medlem=True; legacy is_admin gir global bypass også uten medlemskap.
- ETTER: Medlemskap/samarbeid beholdes; ingen selskapsadmin. Prosjektavgrenset deltakelse, ikke generell BusBar-drift.
- Operative permission-nøkler som ikke fjernes i dette steget: absence.approve, absence.create_for_others, absence.create_self, absence.view_company, absence.view_team, calc.edit, calc.view, calculations.ai_generate, calculations.create, calculations.create_offer, calculations.edit, calendar.delete_events, calendar.read_busy, calendar.view_external, calendar.write_events, change_orders.cancel, change_orders.create, change_orders.mark_invoiced, change_orders.send, comm.create_note, comm.delete_note, comm.view, contracts.admin, contracts.analyze, contracts.create, contracts.edit, contracts.read, contracts.upload_document, data.delete, docs.delete, docs.upload, docs.view, documents.analyze, documents.delete, documents.upload, jobs.archive, jobs.assign_users, jobs.create, jobs.delete, jobs.edit, jobs.view, jobs.view_pricing, leads.convert, leads.create, leads.edit, leads.manage_participants, leads.transfer_owner, leads.view, module.absence, module.calendar, module.communication, module.contracts, module.customers, module.documents, module.inbox, module.invoice_basis, module.leads, module.management, module.overview, module.projects, module.resource_plan, module.sales, module.sharepoint, offers.archive, offers.create, offers.delete, offers.edit, offers.view, postkontor.admin, postkontor.view, projects.delete_attachment, projects.edit_plan, resourceplan.edit_others, resourceplan.schedule, resourceplan.view, resourceplan.view_busy, resourceplan.view_external_blocks, resourceplan.view_external_details, resourceplan.view_external_titles, scope.view.company, sharepoint.delete, sharepoint.link_job, sharepoint.upload, sharepoint.view, task_thread.comment_internal, task_thread.manage, task_thread.upload_attachments, task_thread.view

## Stian Aarstad
Konto: `88d51d9b-a6cb-40e8-9f24-3466caf2faad`. Aktiv/verifisert: True/True.
- Legacy roller: ingen
- Aktive selskaper: BusBar AS, MCS Elektrotavler AS, MCS Service AS
- V2-roller: Planlegger/Admin [global], Prosjektleder [global]
- Eksplisitte systemnøkler som må skilles fra drift: admin.data_integrity, admin.manage_companies, admin.manage_departments, admin.manage_roles, admin.manage_settings, admin.manage_users, module.admin, security.manage, security.view
### MCS Service AS
- FØR: aktivt medlem=True; legacy is_admin gir global bypass også uten medlemskap.
- ETTER: Operative roller beholdes; ingen automatisk selskapsadmin.
### MCS Elektrotavler AS
- FØR: aktivt medlem=True; legacy is_admin gir global bypass også uten medlemskap.
- ETTER: Operative roller beholdes; ingen automatisk selskapsadmin.
### BusBar AS
- FØR: aktivt medlem=True; legacy is_admin gir global bypass også uten medlemskap.
- ETTER: Operative roller beholdes; ingen automatisk selskapsadmin.
- Operative permission-nøkler som ikke fjernes i dette steget: absence.approve, absence.create_for_others, absence.create_self, absence.view_company, absence.view_team, calc.edit, calc.view, calculations.ai_generate, calculations.create, calculations.create_offer, calculations.edit, calendar.delete_events, calendar.read_busy, calendar.view_external, calendar.write_events, change_orders.cancel, change_orders.create, change_orders.mark_invoiced, change_orders.send, comm.create_note, comm.delete_note, comm.view, contracts.admin, contracts.analyze, contracts.create, contracts.edit, contracts.read, contracts.upload_document, data.delete, docs.delete, docs.upload, docs.view, documents.analyze, documents.delete, documents.upload, jobs.archive, jobs.assign_users, jobs.create, jobs.delete, jobs.edit, jobs.view, jobs.view_pricing, leads.convert, leads.create, leads.edit, leads.manage_participants, leads.transfer_owner, leads.view, module.absence, module.calendar, module.communication, module.contracts, module.customers, module.documents, module.inbox, module.invoice_basis, module.leads, module.management, module.overview, module.projects, module.resource_plan, module.sales, module.sharepoint, offers.archive, offers.create, offers.delete, offers.edit, offers.view, postkontor.admin, postkontor.view, projects.delete_attachment, projects.edit_plan, resourceplan.edit_others, resourceplan.schedule, resourceplan.view, resourceplan.view_busy, resourceplan.view_external_blocks, resourceplan.view_external_details, resourceplan.view_external_titles, scope.view.company, sharepoint.delete, sharepoint.link_job, sharepoint.upload, sharepoint.view, task_thread.comment_internal, task_thread.manage, task_thread.upload_attachments, task_thread.view

## Thomas Treffen
Konto: `5a50a16b-ed15-4720-8cd6-3c303100395f`. Aktiv/verifisert: True/True.
- Legacy roller: super_admin
- Aktive selskaper: MCS Service AS
- V2-roller: Superadmin [global]
- Eksplisitte systemnøkler som må skilles fra drift: admin.data_integrity, admin.manage_companies, admin.manage_departments, admin.manage_roles, admin.manage_settings, admin.manage_users, module.admin, security.manage, security.view
### MCS Service AS
- FØR: aktivt medlem=True; legacy is_admin gir global bypass også uten medlemskap.
- ETTER: Global superadmin uendret; egne innstillinger/ordrevarsling uendret.
### MCS Elektrotavler AS
- FØR: aktivt medlem=False; legacy is_admin gir global bypass også uten medlemskap.
- ETTER: Global superadmin uendret; egne innstillinger/ordrevarsling uendret.
### BusBar AS
- FØR: aktivt medlem=False; legacy is_admin gir global bypass også uten medlemskap.
- ETTER: Global superadmin uendret; egne innstillinger/ordrevarsling uendret.
- Operative permission-nøkler som ikke fjernes i dette steget: absence.approve, absence.create_for_others, absence.create_self, absence.view_company, absence.view_team, calc.edit, calc.view, calculations.ai_generate, calculations.create, calculations.create_offer, calculations.edit, calendar.delete_events, calendar.read_busy, calendar.view_external, calendar.write_events, change_orders.cancel, change_orders.create, change_orders.mark_invoiced, change_orders.send, comm.create_note, comm.delete_note, comm.view, contracts.admin, contracts.analyze, contracts.create, contracts.edit, contracts.read, contracts.upload_document, data.delete, docs.delete, docs.upload, docs.view, documents.analyze, documents.delete, documents.upload, jobs.archive, jobs.assign_users, jobs.create, jobs.delete, jobs.edit, jobs.view, jobs.view_pricing, leads.convert, leads.create, leads.create_meeting, leads.edit, leads.email_draft, leads.manage_participants, leads.transfer_owner, leads.view, module.absence, module.calendar, module.communication, module.contracts, module.customers, module.documents, module.fag, module.inbox, module.invoice_basis, module.leads, module.management, module.overview, module.projects, module.resource_plan, module.sales, module.sharepoint, offers.archive, offers.create, offers.delete, offers.edit, offers.view, postkontor.admin, postkontor.view, projects.delete_attachment, projects.edit_plan, regulation.review, resourceplan.cross_company, resourceplan.edit_others, resourceplan.schedule, resourceplan.view, resourceplan.view_busy, resourceplan.view_external_blocks, resourceplan.view_external_details, resourceplan.view_external_titles, scope.view.all, security.audit.view, security.export, security.sensitive.view, sharepoint.admin, sharepoint.delete, sharepoint.link_job, sharepoint.upload, sharepoint.view, task_thread.comment_internal, task_thread.email_external, task_thread.manage, task_thread.upload_attachments, task_thread.view

## Eget godkjenningspunkt A – Simen

Legg til `user_roles(user_id=9ee227c5-7cc0-409a-93aa-1ef0696d27ca, role=super_admin)` idempotent, med Thomas som aktør i revisjonslogg. Ingen andre rader endres. Nå: admin, ikke super_admin. Etter: admin + super_admin. Thomas 5a50a16b-ed15-4720-8cd6-3c303100395f beholder sin eksisterende super_admin-rad.

Rollback: fjern kun den nye, identifiserte Simen-tildelingen hvis den faktisk ble opprettet av denne operasjonen; aldri fjern Thomas eller en allerede eksisterende tildeling. Ta før-hash/aktør/tid, krev ny read-back rett før transaksjonen og etter commit. Kontroller Simen innlogget før senere innsnevring.

## Eget godkjenningspunkt B – avgrenset tilgangsskriving

45 restriktive skrivegrenser på 15 sikkerhetskilder i access-write-gates.staged.sql. Ingen SELECT-endring, ingen jobber/HMS/ordrepolicyer endres. Thomas og godkjent Simen beholder skriveevne der eksisterende permissive regler også tillater. De syv øvrige mister direkte INSERT/UPDATE/DELETE på tilgangskilder, inkl. person↔login. Dette er ikke generell selskapsspesifikk HR-redigering. Rune beholder bestillings-RPC og MCS Service company_admin_assignments-rad; John/Mats/Sindre får ingen nye selskapsadminrader.

Sperre: personopprettelse med login/roller og user_accounts-write er koblet til HR; superadmin-only for hele personopprettelsen må godkjennes eller splittes fra ren ansettelsesredigering. Ikke aktivert.

## Uavklart operativ diff C

En global erstatning is_admin→is_company_admin ville ta bort policybasert tilgang også i hjem-/medlemsselskapene til John, Mats, Sindre, Hans Jakob, Lars Erik og Stian, fordi de ikke har eksplisitt company_admin_assignments. Dette gjelder alle policyene i policy-matrix.md, ikke bare tilgangsstyring. Ingen automatisk selskapsadmin er foreslått. Eksisterende permission-nøkler alene beviser ikke CRUD i alle disse policyene. Derfor aktiveres ikke brede RLS-endringer før rad-/kommando-projeksjon og konkrete operative erstatningsregler er godkjent.

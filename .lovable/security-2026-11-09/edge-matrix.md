# Edge-funksjonsinventar 09.11.2026

Statisk kildeklassifisering; ikke runtime-attestasjon. Fravær av mønster er en granskningsindikasjon, ikke automatisk sårbarhet.

| Funksjon | Forhøyet nøkkel | Identitet/service/token-signal | Rolle-/modulsignal | Selskaps-/ressurssignal |
|---|---|---|---|---|
| absence-calendar-sync | Ja | getUser, Authorization, authorization, token | Ikke direkte | event_id |
| add-participant | Ja | getUser, Authorization, authorization | Ikke direkte | company_id, project_id |
| add-technicians | Ja | getUser, Authorization, authorization | Ikke direkte | company_id |
| ai-project-matcher | Ja | Authorization, authorization, token | Ikke direkte | company_id, project_id |
| analyze-document | Ja | getClaims, Authorization, authorization, token | Ikke direkte | job_id |
| analyze-message-actions | Ja | Authorization, authorization | Ikke direkte | Ikke direkte |
| approval-reminder | Ja | getUser, getApprovalCallerId, Authorization, token | has_company_access, getApprovalCallerId | company_id, event_id, job_id |
| approve-change-order | Ja | authorization, token | Ikke direkte | job_id |
| auth-callback | Ja | Authorization, authorization, token | Ikke direkte | Ikke direkte |
| calc-ai-analyze | Ja | getUser, Authorization, authorization | Ikke direkte | Ikke direkte |
| calendar-write-sync | Ja | getUser, getApprovalCallerId, Authorization, token | has_company_access, getApprovalCallerId | company_id, project_id, event_id, job_id |
| case-offer-ai-draft | Ja | getUser, Authorization, authorization | Ikke direkte | Ikke direkte |
| classify-attachment | Ja | Authorization, authorization | Ikke direkte | Ikke direkte |
| company-migrate | Ja | getUser, Authorization, authorization | check_permission | company_id |
| competence-document-upload | Ja | getClaims, Authorization, token | Ikke direkte | company_id |
| confirm-schedule-block | Ja | getUser, Authorization, authorization, token | has_company_access | company_id, project_id, event_id |
| contract-ai | Ja | getClaims, Authorization, authorization, token | check_permission | company_id, job_id |
| contract-alerts-cron | Ja | getClaims, getUser, Authorization, authorization | Ikke direkte | company_id, event_id, job_id |
| conversation-email-reprocess | Ja | Authorization, authorization, token | Ikke direkte | company_id, project_id |
| conversation-email-send | Ja | Authorization, authorization, token | Ikke direkte | company_id, project_id |
| conversation-export-pdf | Ja | getUser, Authorization, authorization | Ikke direkte | project_id |
| conversation-invite-accept | Ja | getUser, Authorization, authorization, token | Ikke direkte | company_id, project_id |
| conversation-invite-send | Ja | getUser, Authorization, authorization, token | Ikke direkte | company_id, project_id |
| create-approval | Ja | getUser, getApprovalCallerId, Authorization, token | has_company_access, getApprovalCallerId | company_id, event_id, job_id |
| create-job-from-schedule-block | Ja | getUser, Authorization, authorization | has_company_access | company_id, project_id, event_id, job_id |
| create-lead-email-draft | Ja | getUser, Authorization, authorization, token | Ikke direkte | Ikke direkte |
| create-person | Ja | getUser, Authorization, authorization | Ikke direkte | company_id |
| customer-portal-invite | Ja | getUser, Authorization, authorization | Ikke direkte | company_id, project_id |
| data-integrity | Ja | getUser, Authorization, authorization | check_permission | job_id |
| delete-person | Ja | getUser, Authorization, authorization | Ikke direkte | Ikke direkte |
| delete-schedule-block | Ja | getUser, Authorization, authorization, token | check_permission | project_id, event_id, job_id |
| extract-image-text | Ja | Authorization, authorization | Ikke direkte | Ikke direkte |
| extract-user-document | Ja | getClaims, Authorization, authorization, token | Ikke direkte | Ikke direkte |
| fag-image-analyze | Ja | getUser, Authorization, authorization, token | Ikke direkte | company_id |
| fetch-employees | Ja | getUser, Authorization, authorization, token | Ikke direkte | Ikke direkte |
| generate-calculation-ai | Ja | getUser, Authorization, authorization | check_permission | Ikke direkte |
| generate-offer-pdf | Ja | authorization | Ikke direkte | Ikke direkte |
| graph-subscription-manage | Ja | Authorization, authorization, clientState, token | Ikke direkte | company_id |
| graph-subscription-renew-cron | Ja | Authorization, authorization, token | Ikke direkte | Ikke direkte |
| graph-subscription-sync | Ja | Authorization, authorization, clientState, token | Ikke direkte | company_id |
| graph-webhook-inbound | Ja | Authorization, authorization, clientState, token | Ikke direkte | company_id, project_id |
| handle-approval | Ja | getUser, Authorization, authorization, token | Ikke direkte | event_id, job_id |
| hms-chemical-sds | Ja | getUser, Authorization, authorization, token | Ikke direkte | company_id |
| hms-chemical-send | Ja | getUser, Authorization, authorization, token | Ikke direkte | company_id |
| hms-handbook-send | Ja | getUser, Authorization, authorization, token | Ikke direkte | company_id |
| import-outlook-tasks | Ja | getUser, Authorization, authorization, token | Ikke direkte | company_id, event_id |
| inbox-debug | Ja | getUser, Authorization, authorization, token | Ikke direkte | Ikke direkte |
| inbox-scan | Ja | getClaims, Authorization, token | Ikke direkte | Ikke direkte |
| inbox-sync | Ja | getUser, Authorization, authorization, token | Ikke direkte | company_id, project_id, job_id |
| inspection-report-analyze | Ja | getUser, Authorization, authorization, token | Ikke direkte | Ikke direkte |
| inspection-response-send | Ja | getUser, Authorization, token | has_company_access | company_id |
| job-access | Ja | getApprovalCallerId, Authorization, token | check_permission, getApprovalCallerId | event_id, job_id |
| lead-calendar-event | Ja | getUser, Authorization, authorization, token | Ikke direkte | event_id |
| list-users | Ja | getUser, Authorization, authorization | Ikke direkte | Ikke direkte |
| m365-dispatch | Ja | getApprovalCallerId, Authorization | has_company_access, getApprovalCallerId | company_id, event_id, job_id |
| manage-role | Ja | getUser, Authorization, authorization, token | Ikke direkte | Ikke direkte |
| material-ai-suggest | Ja | Authorization, authorization, token | Ikke direkte | company_id |
| ms-calendar | Ja | getClaims, getUser, Authorization, token | check_permission | event_id, job_id |
| ms-debug | Ja | getUser, Authorization, authorization, token | Ikke direkte | Ikke direkte |
| ms-mail | Ja | getUser, Authorization, authorization, token | Ikke direkte | event_id |
| notify-event-changes | Ja | getUser, getApprovalCallerId, Authorization, token | has_company_access, getApprovalCallerId | company_id, event_id, job_id |
| offer-activity | Ja | getUser, Authorization, authorization | Ikke direkte | company_id |
| offer-followup-check | Ja | authorization | Ikke direkte | company_id |
| offer-public-view | Ja | authorization, token | Ikke direkte | company_id |
| order-attachment-public-fetch | Ja | authorization, token | Ikke direkte | Ikke direkte |
| order-form-notify | Ja | Authorization, authorization, token | Ikke direkte | Ikke direkte |
| order-message-email-send | Ja | Authorization, authorization, token | Ikke direkte | company_id |
| order-message-public-send | Ja | getUser, Authorization, authorization, token | Ikke direkte | Ikke direkte |
| outlook-schedule-sync | Ja | Authorization, authorization, token | Ikke direkte | company_id, project_id, event_id |
| outlook-sync | Ja | getUser, Authorization, authorization, token | Ikke direkte | event_id |
| parse-form-pdf | Ja | Authorization, authorization | Ikke direkte | Ikke direkte |
| planning-external-file | Ja | token | Ikke direkte | Ikke direkte |
| planning-external-invite | Ja | getApprovalCallerId, Authorization, token | getApprovalCallerId | project_id, planning_project |
| planning-external-login | Ja | getApprovalCallerId, Authorization, authorization, token | getApprovalCallerId | project_id, planning_project |
| portal-approve-journal | Ja | getUser, Authorization, authorization | Ikke direkte | company_id, project_id |
| portal-approve-work-package | Ja | getUser, Authorization, authorization | Ikke direkte | company_id, project_id |
| portal-notify | Ja | getUser, isExactServiceBearer, Authorization, authorization | Ikke direkte | project_id |
| regulation-query | Ja | getUser, Authorization, authorization | Ikke direkte | company_id, event_id |
| remove-work-visit-from-plan | Ja | getUser, Authorization, token | check_permission | event_id, job_id |
| schedule-sweep-orphans | Ja | Authorization, authorization | Ikke direkte | Ikke direkte |
| seed-order-template | Ja | getUser, Authorization, authorization | Ikke direkte | company_id |
| send-change-order | Ja | getUser, Authorization, authorization, token | check_permission | job_id |
| service-journal-pdf | Ja | getUser, Authorization, authorization | Ikke direkte | project_id, job_id |
| service-journal-share | Ja | getUser, Authorization, authorization, token | Ikke direkte | project_id, job_id |
| sharepoint-connect | Ja | getUser, Authorization, authorization, token | check_permission | company_id, event_id, job_id |
| sharepoint-list | Ja | getUser, Authorization, authorization, token | check_permission | company_id, project_id, job_id |
| sharepoint-preview-url | Ja | getUser, Authorization, authorization, token | check_permission | company_id, job_id |
| sharepoint-upload | Ja | getUser, Authorization, authorization, token | check_permission | company_id, event_id, job_id |
| suggest-task-from-email | Ja | getUser, Authorization, authorization, token | Ikke direkte | project_id, event_id |
| sync-task-to-calendar | Ja | getUser, Authorization, authorization, token | Ikke direkte | event_id |
| system-health | Ja | getUser, Authorization, authorization, token | has_role | Ikke direkte |
| task-thread-daily-digest | Ja | getUser, isExactServiceBearer, Authorization, authorization, token | check_permission | company_id, event_id, job_id |
| task-thread-email-send | Ja | getUser, Authorization, authorization, token | check_permission | company_id, project_id, event_id |
| task-thread-escalation | Ja | authorization | Ikke direkte | company_id, event_id, job_id |
| teams-meeting | Ja | getUser, Authorization, authorization, token | Ikke direkte | event_id, job_id |
| tripletex-import | Ja | getClaims, Authorization | has_role, tripletex-guard | company_id, project_id, event_id |
| tripletex-participants | Ja | getUser, Authorization | has_role, tripletex-guard | company_id, project_id, event_id |
| tripletex-project | Ja | getUser, Authorization, token | has_role, tripletex-guard | company_id, project_id, event_id, planning_project |
| tripletex-test-health | Ja | getUser, Authorization, token | has_role, tripletex-guard | company_id |
| worktime-aml-evaluate | Ja | MANGLER | Ikke direkte | company_id |

Totalt 100 direkte service-role-brukende innganger.

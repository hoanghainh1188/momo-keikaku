export const NO_ROWS = {
    mappingEvents: [],
    mappingHeads: [],
    dispositions: [],
    audits: [],
    workPackages: [],
    departments: [],
    programs: [],
    projects: [],
    resources: [],
    rateEntries: [],
    projectDefaultRates: [],
    memberships: [],
    membershipsRemoved: [],
    connectors: [],
    connectorScopeEvents: [],
    connectorSettingEvents: [],
    mappingRules: [],
};
function dispositionMappings({ target, at, actor }, wpId) {
    return target.ticketIds.map((ticketId) => ({
        id: `map-${ticketId}-${at.getTime()}`,
        tenantId: target.tenantId,
        projectId: target.projectId,
        ticketId,
        wpId,
        source: 'disposition',
        ruleId: null,
        at,
        actor,
    }));
}
/** Head dual-write shape matching an event (no id; seq stripped at assert). Sorted by ticketId. */
function mappingHeadsFor(events) {
    return events
        .map(({ tenantId, projectId, ticketId, wpId, source, ruleId, at, actor }) => ({
        tenantId,
        projectId,
        ticketId,
        wpId,
        source,
        ruleId,
        at,
        actor,
    }))
        .sort((a, b) => a.ticketId.localeCompare(b.ticketId));
}
function disposition({ target, at, actor }, kind, wpId, note) {
    return {
        dispositions: [
            {
                id: `disp-${kind}-${at.getTime()}`,
                tenantId: target.tenantId,
                projectId: target.projectId,
                kind,
                ticketIds: [...target.ticketIds],
                wpId,
                note,
                at,
                actor,
            },
        ],
        audits: [
            {
                tenantId: target.tenantId,
                actor,
                action: `disposition.${kind}`,
                target: target.projectId,
                payload: { ticketIds: [...target.ticketIds], wpId, note },
                at,
            },
        ],
    };
}
/** FR-21's manual Mapping rows. `wpId` is the raw command value: `''` is release (story 5.9). */
export function manualMapping(target, at, actor, wpId) {
    const ticketId = target.ticketIds[0];
    const release = wpId === '';
    const event = {
        id: `map-${ticketId}-${at.getTime()}`,
        tenantId: target.tenantId,
        projectId: target.projectId,
        ticketId,
        wpId: release ? null : wpId,
        source: release ? 'release' : 'manual',
        ruleId: null,
        at,
        actor,
    };
    return {
        ...NO_ROWS,
        mappingEvents: [event],
        mappingHeads: mappingHeadsFor([event]),
        audits: [
            {
                tenantId: target.tenantId,
                actor,
                action: release ? 'mapping.unmap' : 'mapping.map',
                target: ticketId,
                payload: { wpId },
                at,
            },
        ],
    };
}
/** One organisation audit row, stamped with the Clock. */
function orgAudit({ target, now, actor }, action, on, payload) {
    return [{ tenantId: target.tenantId, actor, action, target: on, payload, at: now }];
}
/** Project-anchor-stamped audit (connector writes use the Project's demoAnchor). */
function projectAudit({ target, at, actor }, action, on, payload) {
    return [{ tenantId: target.tenantId, actor, action, target: on, payload, at }];
}
/** The member's bridge row as it was before the write, in the target's Tenant. */
function memberBefore({ before, target }) {
    const row = before.memberships.find((m) => m.userId === target.memberUserId);
    if (!row)
        throw new Error(`the probe Tenant has no membership of ${target.memberUserId} to change`);
    return row;
}
/** A row as it was before the write — the base an in-place change is expected against. */
function rowBefore(rows, id, table) {
    const row = rows.find((r) => r.id === id);
    if (!row)
        throw new Error(`the probe Tenant has no ${table} ${id} to change`);
    return row;
}
/** A fixture rule's row as it was before the write (story 5.10). */
function ruleBefore({ before }, ruleId) {
    return rowBefore(before.mappingRules, ruleId, 'mapping_rule');
}
/** The audit shape of a rule row. */
function auditedRule(row) {
    return {
        name: row.name,
        priority: row.priority,
        wpId: row.wpId,
        matchField: row.matchField,
        matchValue: row.matchValue,
    };
}
/**
 * The rule events a re-evaluation appends when `ruleId` stops holding its Tickets and no other
 * live rule matches them: one `rule` event per Ticket it held, `wp_id = null`, naming the rule it
 * left — and the dual-written heads. (The fixture's two rules match disjoint categories.)
 */
function ruleLeft(ctx, ruleId) {
    const { target, at, actor, before } = ctx;
    const events = before.mappingHeads
        .filter((h) => h.projectId === target.projectId && h.source === 'rule' && h.ruleId === ruleId && h.wpId !== null)
        .map((h) => h.ticketId)
        .sort((a, b) => a.localeCompare(b))
        .map((ticketId) => ({
        id: `map-rule-${ticketId}-${at.getTime()}`,
        tenantId: target.tenantId,
        projectId: target.projectId,
        ticketId,
        wpId: null,
        source: 'rule',
        ruleId,
        at,
        actor,
    }));
    return { mappingEvents: events, mappingHeads: mappingHeadsFor(events) };
}
export const EXPECTED = {
    // --- Story 5.10: Mapping Rules ---------------------------------------------------------------
    reorderMappingRules: (ctx) => {
        const [first, second] = ctx.target.rules;
        const a = ruleBefore(ctx, first.id);
        const b = ruleBefore(ctx, second.id);
        return {
            ...NO_ROWS,
            mappingRules: [
                { ...b, priority: 1 },
                { ...a, priority: 2 },
            ].sort((x, y) => x.id.localeCompare(y.id)),
            audits: projectAudit(ctx, 'mapping.rule_reorder', ctx.target.projectId, {
                projectId: ctx.target.projectId,
                before: [a, b].sort((x, y) => x.priority - y.priority).map((r) => r.id),
                after: [second.id, first.id],
                moved: 0,
            }),
        };
    },
    updateMappingRule: (ctx) => {
        const was = ruleBefore(ctx, ctx.target.rules[0].id);
        const after = { ...was, name: 'Harness rule renamed', priority: 100 };
        return {
            ...NO_ROWS,
            mappingRules: [after],
            audits: projectAudit(ctx, 'mapping.rule_update', was.id, {
                projectId: ctx.target.projectId,
                before: auditedRule(was),
                after: auditedRule(after),
                moved: 0,
            }),
        };
    },
    createMappingRule: (ctx) => {
        const id = ctx.newIds.at(-1);
        const row = {
            id,
            tenantId: ctx.target.tenantId,
            projectId: ctx.target.projectId,
            priority: 50,
            name: 'Harness rule',
            wpId: ctx.target.wpId,
            matchField: 'keyPattern',
            matchValue: 'ZZ-NOMATCH-*',
            deletedAt: null,
        };
        return {
            ...NO_ROWS,
            mappingRules: [row],
            audits: projectAudit(ctx, 'mapping.rule_create', id, {
                projectId: ctx.target.projectId,
                rule: auditedRule(row),
                moved: 0,
            }),
        };
    },
    deleteMappingRule: (ctx) => {
        const was = ruleBefore(ctx, ctx.target.rules[1].id);
        const left = ruleLeft(ctx, was.id);
        return {
            ...NO_ROWS,
            ...left,
            mappingRules: [{ ...was, deletedAt: ctx.at }],
            audits: projectAudit(ctx, 'mapping.rule_delete', was.id, {
                projectId: ctx.target.projectId,
                before: auditedRule(was),
                moved: left.mappingEvents.length,
            }),
        };
    },
    mapTickets: (ctx) => {
        const events = dispositionMappings(ctx, ctx.target.wpId);
        return {
            ...NO_ROWS,
            mappingEvents: events,
            mappingHeads: mappingHeadsFor(events),
            ...disposition(ctx, 'map', ctx.target.wpId, null),
        };
    },
    planTicketsAsWorkPackage: (ctx) => {
        const { target, ninesBefore } = ctx;
        // The id the use case issued from the harness's id port — not `wp-new-<anchor ms>`, which
        // collided across Tenants because `work_package.id` is a global primary key (retro A1).
        const wpId = ctx.newIds.at(-1);
        const events = dispositionMappings(ctx, wpId);
        return {
            ...NO_ROWS,
            mappingEvents: events,
            mappingHeads: mappingHeadsFor(events),
            ...disposition(ctx, 'plan', wpId, null),
            workPackages: [
                {
                    id: wpId,
                    tenantId: target.tenantId,
                    projectId: target.projectId,
                    wbsCode: `9.${ninesBefore + 1}`,
                    name: 'Harness Plan',
                    parentId: null,
                    childCount: 0,
                    isLeaf: true,
                    isMilestone: false,
                    isCatchAll: false,
                    durationDays: null,
                    constraintType: 'asap',
                    constraintDate: null,
                    plannedMh: 0n,
                    assignedResourceIds: [],
                    deletedAt: null,
                },
            ],
        };
    },
    explainTickets: (ctx) => ({ ...NO_ROWS, ...disposition(ctx, 'explain', null, 'Harness note.') }),
    markChangeRequestCandidates: (ctx) => ({
        ...NO_ROWS,
        ...disposition(ctx, 'cr_candidate', null, null),
    }),
    mapTicket: ({ target, at, actor }) => manualMapping(target, at, actor, target.wpId),
    // --- FR-1's organisation writes ----------------------------------------------------------------
    createDepartment: (ctx) => {
        const [id] = ctx.newIds;
        return {
            ...NO_ROWS,
            departments: [{ id, tenantId: ctx.target.tenantId, name: 'Harness Department' }],
            audits: orgAudit(ctx, 'department.create', id, { name: 'Harness Department' }),
        };
    },
    renameDepartment: (ctx) => {
        const was = rowBefore(ctx.before.departments, ctx.target.departmentId, 'department');
        return {
            ...NO_ROWS,
            departments: [{ ...was, name: 'Harness Department renamed' }],
            audits: orgAudit(ctx, 'department.rename', was.id, {
                before: was.name,
                after: 'Harness Department renamed',
            }),
        };
    },
    createProgram: (ctx) => {
        const [id] = ctx.newIds;
        const { tenantId, departmentId } = ctx.target;
        return {
            ...NO_ROWS,
            programs: [{ id, tenantId, departmentId, name: 'Harness Program' }],
            audits: orgAudit(ctx, 'program.create', id, { departmentId, name: 'Harness Program' }),
        };
    },
    renameProgram: (ctx) => {
        const was = rowBefore(ctx.before.programs, ctx.target.programId, 'program');
        return {
            ...NO_ROWS,
            programs: [{ ...was, name: 'Harness Program renamed' }],
            audits: orgAudit(ctx, 'program.rename', was.id, {
                before: was.name,
                after: 'Harness Program renamed',
            }),
        };
    },
    createProject: (ctx) => {
        const [id] = ctx.newIds;
        const { tenantId, departmentId, programId } = ctx.target;
        return {
            ...NO_ROWS,
            projects: [
                {
                    id,
                    tenantId,
                    departmentId,
                    programId,
                    name: 'Harness Project',
                    clientName: 'Harness Client',
                    contractType: '準委任',
                    // The documented defaults (packages/app's NEW_PROJECT_DEFAULTS), pinned as values.
                    tzOffsetMinutes: 540,
                    teireiWeekday: 1,
                    defaultRateJpy: 0,
                    eacMethod: 'typical',
                    calendarJp: true,
                    calendarVn: false,
                    demoAnchor: ctx.now,
                    // Story 2.1: a Project is created with none of its three schedule settings (AD-25).
                    projectStart: null,
                    projectFinish: null,
                    dataDate: null,
                },
            ],
            // Story 1.6: first project_default_rate_entry at yen 0, effective on the Project date.
            projectDefaultRates: [
                {
                    tenantId,
                    projectId: id,
                    effectiveFrom: '2026-09-20', // TEST_NOW (2026-09-20T01:02:03Z) in JST (tz 540)
                    yenPerHour: 0,
                },
            ],
            audits: orgAudit(ctx, 'project.create', id, {
                name: 'Harness Project',
                departmentId,
                programId,
                clientName: 'Harness Client',
                contractType: '準委任',
                tzOffsetMinutes: 540,
                teireiWeekday: 1,
                defaultRateJpy: 0,
                eacMethod: 'typical',
                calendarJp: true,
                calendarVn: false,
                demoAnchor: ctx.now.toISOString(),
            }),
        };
    },
    renameProject: (ctx) => {
        const was = rowBefore(ctx.before.projects, ctx.target.projectId, 'project');
        return {
            ...NO_ROWS,
            projects: [{ ...was, name: 'Harness Project renamed' }],
            audits: orgAudit(ctx, 'project.rename', was.id, {
                before: was.name,
                after: 'Harness Project renamed',
            }),
        };
    },
    reassignProjectProgram: (ctx) => {
        const was = rowBefore(ctx.before.projects, ctx.target.projectId, 'project');
        return {
            ...NO_ROWS,
            projects: [{ ...was, programId: null }],
            audits: orgAudit(ctx, 'project.reassign_program', was.id, {
                before: was.programId,
                after: null,
            }),
        };
    },
    reassignProjectDepartment: (ctx) => {
        const was = rowBefore(ctx.before.projects, ctx.target.projectId, 'project');
        const { departmentId, programId } = ctx.target;
        return {
            ...NO_ROWS,
            projects: [{ ...was, departmentId, programId }],
            audits: orgAudit(ctx, 'project.reassign_department', was.id, {
                before: { departmentId: was.departmentId, programId: was.programId },
                after: { departmentId, programId },
            }),
        };
    },
    // --- Membership changes (story 1.4 slice 2): the bridge row after the change (or gone), and one
    // Clock-stamped audit row targeting the member's user id, carrying the previous value. --------
    changeMemberRole: (ctx) => {
        const was = memberBefore(ctx);
        return {
            ...NO_ROWS,
            // The Projects are kept on a promotion, so a later demotion restores them.
            memberships: [{ ...was, role: 'tenant_admin' }],
            audits: orgAudit(ctx, 'membership.change_role', was.userId, { before: was.role, after: 'tenant_admin' }),
        };
    },
    assignMemberProject: (ctx) => {
        const was = memberBefore(ctx);
        const after = [...was.projectIds, ctx.target.projectId];
        return {
            ...NO_ROWS,
            memberships: [{ ...was, projectIds: after }],
            audits: orgAudit(ctx, 'membership.assign_project', was.userId, { before: was.projectIds, after }),
        };
    },
    unassignMemberProject: (ctx) => {
        const was = memberBefore(ctx);
        const after = was.projectIds.filter((id) => id !== ctx.target.staleProjectId);
        return {
            ...NO_ROWS,
            memberships: [{ ...was, projectIds: after }],
            audits: orgAudit(ctx, 'membership.unassign_project', was.userId, { before: was.projectIds, after }),
        };
    },
    revokeMembership: (ctx) => {
        const was = memberBefore(ctx);
        return {
            ...NO_ROWS,
            membershipsRemoved: [was],
            audits: orgAudit(ctx, 'membership.revoke', was.userId, {
                before: { role: was.role, projectIds: was.projectIds },
            }),
        };
    },
    createResource: (ctx) => {
        const [id] = ctx.newIds;
        const { tenantId, departmentId } = ctx.target;
        return {
            ...NO_ROWS,
            resources: [
                {
                    id,
                    tenantId,
                    departmentId,
                    name: 'Harness Resource',
                    role: 'Engineer',
                    trackerAccountIds: [],
                },
            ],
            audits: orgAudit(ctx, 'resource.create', id, {
                departmentId,
                name: 'Harness Resource',
                role: 'Engineer',
            }),
        };
    },
    appendResourceRate: (ctx) => {
        const { tenantId, resourceId } = ctx.target;
        return {
            ...NO_ROWS,
            rateEntries: [
                {
                    tenantId,
                    resourceId,
                    effectiveFrom: '2026-06-01',
                    yenPerHour: 5500,
                },
            ],
            audits: orgAudit(ctx, 'rate.append', resourceId, {
                effectiveFrom: '2026-06-01',
                yenPerHour: 5500,
            }),
        };
    },
    appendProjectDefaultRate: (ctx) => {
        const was = rowBefore(ctx.before.projects, ctx.target.projectId, 'project');
        const { tenantId, projectId } = ctx.target;
        return {
            ...NO_ROWS,
            projects: [{ ...was, defaultRateJpy: 4200 }],
            projectDefaultRates: [
                {
                    tenantId,
                    projectId,
                    effectiveFrom: '2026-06-01',
                    yenPerHour: 4200,
                },
            ],
            audits: orgAudit(ctx, 'project_default_rate.append', projectId, {
                effectiveFrom: '2026-06-01',
                yenPerHour: 4200,
            }),
        };
    },
    changeTenantCurrency: () => NO_ROWS,
    addConnector: () => NO_ROWS,
    rotateCredentials: (ctx) => {
        const was = rowBefore(ctx.before.connectors, ctx.target.connectorId, 'connector');
        return {
            ...NO_ROWS,
            connectors: [
                {
                    ...was,
                    credentialsKeyId: 'harness-local',
                    hasCredentials: true,
                },
            ],
            audits: projectAudit(ctx, 'connector.rotate_credentials', ctx.target.connectorId, {
                projectId: ctx.target.projectId,
            }),
        };
    },
    changeConnectorScope: (ctx) => {
        const was = rowBefore(ctx.before.connectors, ctx.target.connectorId, 'connector');
        return {
            ...NO_ROWS,
            connectors: [{ ...was, scope: 'EC2-NEW' }],
            connectorScopeEvents: [
                {
                    tenantId: ctx.target.tenantId,
                    connectorId: ctx.target.connectorId,
                    projectId: ctx.target.projectId,
                    scope: 'EC2-NEW',
                    actor: ctx.actor,
                    at: ctx.at,
                },
            ],
            audits: projectAudit(ctx, 'connector.change_scope', ctx.target.connectorId, {
                projectId: ctx.target.projectId,
                before: was.scope,
                after: 'EC2-NEW',
            }),
        };
    },
    appendResolvedStatuses: (ctx) => ({
        ...NO_ROWS,
        connectorSettingEvents: [
            {
                tenantId: ctx.target.tenantId,
                connectorId: ctx.target.connectorId,
                projectId: ctx.target.projectId,
                resolvedStatusIds: ['Closed', 'Done'],
                actor: ctx.actor,
                at: ctx.at,
            },
        ],
        audits: projectAudit(ctx, 'connector.append_resolved_statuses', ctx.target.connectorId, {
            projectId: ctx.target.projectId,
            resolvedStatusIds: ['Closed', 'Done'],
        }),
    }),
};

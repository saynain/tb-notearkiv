import type { Me } from './access';
import { hasPermission, hasFullArchiveAccess } from './access';
import * as profile from './profile';
import * as members from './members';
import * as projects from './projects';
import * as works from './works';
import * as shares from './shares';
import { MobileError } from '../lib/mobile-http';
import { isGroupLeader } from '../lib/gruppeledere';
import { PROJECT_KINDS, PROJECT_STATUSES, PROJECT_SORTS } from './project-list';
import { filterAction, action, choice, field, file, link, multi, options, remove, row, section, select, text, dateLabel, directions, type Screen, type Values, type Field, type Row } from './mobile-ui';
const partFields = (parts: Array<{
    id: string;
    nameNo: string;
}>) => options(parts, p => p.id, p => p.nameNo);
const projectFields: Field[] = [field('name', 'Navn', 'text', { required: true }), select('kind', 'Type', PROJECT_KINDS.map(x => choice(x))), field('eventDate', 'Dato', 'date', { required: true }), field('venue', 'Sted'), field('description', 'Beskrivelse', 'multiline')];
const workFields: Field[] = [field('title', 'Tittel', 'text', { required: true }), field('subtitle', 'Undertittel'), field('archiveNumber', 'Arkivnummer'), field('composer', 'Komponist'), field('arranger', 'Arrangør'), field('publisher', 'Forlag'), field('genre', 'Sjanger'), field('grade', 'Vanskelighetsgrad (1–5)', 'number', { nullable: true }), field('durationSec', 'Varighet i sekunder', 'number', { nullable: true }), field('physicalLocation', 'Plassering'), field('acquiredYear', 'Anskaffelsesår', 'number', { nullable: true }), field('notes', 'Notater', 'multiline'), select('status', 'Status', [choice('active', 'Aktiv'), choice('archived', 'Arkivert')])];
const valuesFor = (fields: Field[], data: object): Values => Object.fromEntries(fields.map(f => [f.key, (data as Record<string, string | number | boolean | null>)[f.key] ?? (f.nullable ? null : '')]));
export async function memberScreen(path: string[], me: Me, query: URLSearchParams): Promise<Screen | null> {
    const [area, id, sub] = path;
    if (area === 'more')
        return { title: 'Mer', sections: [
                section('member', 'Fellesskapet', [link('profile', 'Min profil', 'Kontaktinformasjon og varsler'), link('members', 'Medlemmer', 'Besetningen og medlemsinformasjon'), link('projects', 'Prosjekter', 'Repertoar, lyd og noter'), ...(hasFullArchiveAccess(me) ? [link('archive', 'Notearkiv', 'Søk og finn verk')] : [])]),
                section('areas', 'Dine områder', [
                    ...(hasPermission(me, 'board.manage') ? [link('board', 'Styret', 'Oppgaver, prosjekter, møter, chat og dokumenter')] : []),
                    ...(isGroupLeader(me) ? [link('leaders', 'Gruppelederne', 'Oversikt og samtaler')] : []),
                    ...(hasPermission(me, 'settings.manage') ? [link('settings', 'Administrasjon', 'Besetning og roller')] : []),
                    ...(hasPermission(me, 'downloads.view') ? [link('downloads', 'Filtilganger', 'Visninger og nedlastinger')] : []),
                ])
            ] };
    if (area === 'profile') {
        const p = await profile.getMyProfile();
        return { title: 'Min profil', sections: [section('profile', 'Medlemskap', [text('name', 'Navn', p.name), text('email', 'E-post', p.email), text('phone', 'Telefon', p.phone), text('role', 'Rolle', p.roleName), text('parts', 'Stemmer', p.parts.join(', '))]), section('notifications', 'E-postvarsler', [
                    row('posts', 'Beskjeder', p.notifyPosts === 'all' ? 'Alle beskjeder' : p.notifyPosts === 'important' ? 'Bare viktige' : 'Av', { actions: [action('profile.updateMyPostNotifications', 'Endre beskjedvarsler', { posts: p.notifyPosts }, [select('posts', 'Beskjeder', [choice('all', 'Alle'), choice('important', 'Bare viktige'), choice('off', 'Av')])])] }),
                    row('mentions', 'Omtaler', p.notifyMentions === 'all' ? 'På' : 'Av', { actions: [action('profile.updateMyMentionNotifications', 'Endre omtalevarsler', { mentions: p.notifyMentions }, [select('mentions', 'Når noen omtaler deg', [choice('all', 'På'), choice('off', 'Av')])])] }),
                    ...(p.canManageBoard ? [row('tasks', 'Styreoppgaver', p.notifyBoardTasks === 'all' ? 'På' : 'Av', { actions: [action('profile.updateMyBoardTaskNotifications', 'Endre oppgavevarsler', { boardTasks: p.notifyBoardTasks }, [select('boardTasks', 'Oppgaver og påminnelser', [choice('all', 'På'), choice('off', 'Av')])])] })] : [])
                ])], actions: [action('account.name', 'Endre navn', { name: p.name }, [field('name', 'Navn', 'text', { required: true })]), action('profile.updateMyPhone', 'Endre telefon', { phone: p.phone }, [field('phone', 'Telefon')]), ...(p.hasPassword ? [action('account.password', 'Endre passord', { revokeOtherSessions: true }, [field('currentPassword', 'Nåværende passord', 'password', { required: true }), field('newPassword', 'Nytt passord (minst 15 tegn)', 'password', { required: true }), field('revokeOtherSessions', 'Logg ut andre enheter', 'toggle')])] : []), action('account.setup', 'Opprett eller tilbakestill passord', {}, [])] };
    }
    if (area === 'members') {
        const d = await members.listMembers();
        const parts = partFields(d.allParts);
        const roles = options(d.allRoles, r => r.id, r => r.name);
        if (id) {
            const m = d.members.find(m => m.id === id);
            if (!m)
                throw new MobileError(404, 'not_found', 'Medlemmet finnes ikke.');
            const acts = [];
            if (m.canEditParts)
                acts.push(action('members.updateMemberParts', 'Endre stemmer', { userId: id, partIds: m.parts.map(p => p.id) }, [multi('partIds', 'Stemmer', parts.filter(p => d.assignablePartIds === null || d.assignablePartIds.includes(p.value)), 'Maks fire. Første valgte stemme er hovedstemme.')]));
            if (d.canManage)
                acts.push(action('members.updateMemberProfile', 'Rediger medlemsinformasjon', { userId: id, name: m.name, phone: m.phone ?? '' }, [field('name', 'Navn', 'text', { required: true }), field('phone', 'Telefon')]), action('members.updateMemberRole', 'Endre rolle', { userId: id, roleId: m.roleId }, [select('roleId', 'Rolle', roles)], { message: 'Rollen bestemmer medlemmets tilgang.' }), action('members.setSectionLeaderParts', 'Gruppelederansvar', { userId: id, partIds: m.leaderPartIds }, [multi('partIds', 'Ansvar for stemmer', parts)]), action('members.sendMemberPasswordReset', 'Send lenke for nytt passord', { userId: id }, [], { message: `Sender en e-post til ${m.email}.` }));
            return { title: m.name, sections: [section('member', 'Medlemsinformasjon', [text('role', 'Rolle', m.roleName), text('parts', 'Stemmer', m.parts.map(p => p.name).join(', ')), row('email', 'E-post', m.email, { url: `mailto:${m.email}` }), ...(m.phone ? [row('phone', 'Telefon', m.phone, { url: `tel:${m.phone}` })] : [])])], actions: acts };
        }
        const q = query.get('q')?.toLocaleLowerCase('nb') ?? '';
        return { title: 'Medlemmer', searchable: true, sections: [section('members', 'Besetningen', d.members.filter(m => (m.name + ' ' + m.parts.map(p => p.name).join(' ')).toLocaleLowerCase('nb').includes(q)).map(m => link('members/' + m.id, m.name, m.parts.map(p => p.name).join(', ') || m.roleName))), ...(d.canManage ? [section('invites', 'Ventende invitasjoner', d.invites.map(i => row(i.email, i.name || i.email, [i.roleName, ...i.partNames].join(' · '), { actions: [remove('members.revokeInvitation', 'Trekk tilbake invitasjon', { email: i.email })] })))] : [])], actions: d.canManage ? [action('members.inviteMember', 'Inviter medlem', { roleId: d.allRoles.find(r => r.id === 'member')?.id ?? d.allRoles[0]?.id ?? '', partIds: [], sendEmail: true }, [field('email', 'E-post', 'text', { required: true }), field('name', 'Navn'), select('roleId', 'Rolle', roles), multi('partIds', 'Stemmer', parts, 'Maks fire. Første valgte blir hovedstemme.'), field('sendEmail', 'Send invitasjon på e-post', 'toggle')])] : [] };
    }
    if (area === 'projects') {
        if (!id) {
            const d = await projects.listProjects({ data: Object.fromEntries(query) as never });
            return { title: 'Prosjekter', searchable: true, sections: d.seasons.map(s => section(s.name, s.name, s.projects.filter(p => p.name.toLowerCase().includes((query.get('q') ?? '').toLowerCase())).map(p => link('projects/' + p.id, p.name, [p.eventDate, p.venue, `${p.workCount} verk`, p.isPublished ? 'Publisert' : 'Utkast'].filter(Boolean).join(' · '))))), actions: [filterAction([select('kind', 'Type', PROJECT_KINDS.map(x => choice(x)), true), select('status', 'Tidsrom', PROJECT_STATUSES.map(x => choice(x)), true), select('sort', 'Sortering', PROJECT_SORTS.map(x => choice(x)), true)], query), ...(d.canManage ? [action('projects.createProject', 'Nytt prosjekt', { kind: PROJECT_KINDS[0], eventDate: new Date().toISOString().slice(0, 10) }, projectFields)] : [])] };
        }
        const d = await projects.getProject({ data: { id } });
        if (sub === 'shares') {
            if (!d.canShare)
                throw new MobileError(403, 'forbidden', 'Du har ikke tilgang til vikarlenker.');
            const [s, m] = await Promise.all([shares.listShares({ data: { projectId: id } }), members.listMembers()]);
            return { title: 'Vikarlenker', sections: [section('shares', d.project.name, s.shares.map(s => row(s.id, s.recipientName, `${s.partNames.join(', ')} · ${s.revokedAt ? 'Trukket tilbake' : 'Utløper ' + dateLabel(s.expiresAt)}`, { actions: s.revokedAt ? [] : [remove('shares.revokeShare', 'Trekk tilbake lenke', { shareId: s.id })] })))], actions: [action('shares.createShare', 'Ny vikarlenke', { projectId: id, partIds: [], days: 14 }, [field('recipientName', 'Vikarens navn', 'text', { required: true }), multi('partIds', 'Stemmer', partFields(m.allParts)), field('days', 'Gyldig i dager (1–180)', 'number', { required: true })], { message: 'Lenken gir tilgang til de valgte stemmene frem til utløpsdatoen.' })] };
        }
        const sections = [section('info', 'Om prosjektet', [text('date', 'Dato', d.project.eventDate), text('venue', 'Sted', d.project.venue), text('description', 'Beskrivelse', d.project.description), ...(d.project.percussionNotes ? [text('percussion', 'Slagverk', d.project.percussionNotes)] : []), ...(d.canShare ? [link('projects/' + id + '/shares', 'Vikarlenker')] : [])])];
        for (const w of d.repertoire) {
            const rows: Row[] = [...(w.note ? [text('note', 'Merknad', w.note)] : []), ...(w.percussionSetup ? [text('percussion', 'Slagverksoppsett', w.percussionSetup)] : []), ...w.partFiles.map(f => file(f.id, f.partName ?? 'Stemme', w.title + '.pdf')), ...(w.scoreFileId ? [file(w.scoreFileId, 'Partitur', w.title + '.pdf')] : []), ...w.audioFiles.map(f => file(f.id, f.label || f.fileName, f.fileName, 'audio')), ...w.links.map(l => row(l.id, l.label || 'Lytt / referanse', l.url, { url: l.url }))];
            if (hasFullArchiveAccess(me))
                rows.push(link('archive/' + w.workId, 'Verkdetaljer', w.composer ?? ''));
            if (d.canManage)
                rows.push(row('manage', 'Repertoarvalg', '', { actions: [action('projects.moveWorkInProject', 'Flytt verk', { projectId: id, workId: w.workId, direction: 'up' }, [select('direction', 'Retning', directions)]), action('projects.updateProjectWorkPercussion', 'Slagverksoppsett', { projectId: id, workId: w.workId, percussionSetup: w.percussionSetup ?? '' }, [field('percussionSetup', 'Oppsett', 'multiline')]), remove('projects.removeWorkFromProject', 'Fjern fra repertoaret', { projectId: id, workId: w.workId })] }));
            sections.push(section(w.workId, w.title, rows));
        }
        const actions = d.canManage ? [action('projects.updateProject', 'Rediger prosjekt', { id, ...valuesFor(projectFields, d.project), percussionNotes: d.project.percussionNotes ?? '' }, [...projectFields, field('percussionNotes', 'Samlet slagverksplan', 'multiline')]), action('projects.updateProject', d.project.isPublished ? 'Avpubliser' : 'Publiser', { id, isPublished: !d.project.isPublished }), remove('projects.deleteProject', 'Slett prosjekt', { id })] : [];
        if (d.canManage) {
            const picker = await projects.searchWorksForPicker({ data: { excludeProjectId: id } });
            actions.unshift(action('projects.addWorkToProject', 'Legg til verk', { projectId: id }, [{ ...select('workId', 'Verk', options(picker.works, w => w.id, w => w.title)), lookup: 'project-works' }, field('note', 'Merknad')]));
        }
        return { title: d.project.name, sections, actions, archive: { name: d.project.name + ' — mine stemmer', files: d.repertoire.flatMap((w, i) => w.myFiles.map(f => ({ path: '/api/files/' + encodeURIComponent(f.id), name: `${String(i + 1).padStart(2, '0')} - ${w.title} - ${f.partName ?? f.fileName}.pdf`, kind: 'pdf' }))) } };
    }
    if (area === 'archive') {
        if (!id) {
            const d = await works.listWorks({ data: { ...Object.fromEntries(query), ...(query.get('grade') ? { grade: Number(query.get('grade')) } : {}), ...(query.get('year') ? { year: Number(query.get('year')) } : {}) } as never });
            return { title: 'Notearkiv', searchable: true, sections: [section('works', `${d.works.length} verk`, d.works.map(w => link('archive/' + w.id, w.title, [w.archiveNumber, w.composer, w.status === 'archived' ? 'Arkivert' : '', `${w.counts.parts} stemmer`].filter(Boolean).join(' · '))))], actions: [filterAction([select('status', 'Status', [choice('active', 'Aktive'), choice('archived', 'Arkiverte'), choice('all', 'Alle')], true), select('composer', 'Komponist', d.options.composers.map(x => choice(x)), true), select('arranger', 'Arrangør', d.options.arrangers.map(x => choice(x)), true), select('genre', 'Sjanger', d.options.genres.map(x => choice(x)), true), field('grade', 'Vanskelighetsgrad (1–5)', 'number', { nullable: true }), field('year', 'Anskaffelsesår', 'number', { nullable: true }), select('sort', 'Sorter etter', [choice('title', 'Tittel'), choice('composer', 'Komponist'), choice('grade', 'Vanskelighetsgrad'), choice('duration', 'Varighet'), choice('updated', 'Sist oppdatert')], true), select('dir', 'Rekkefølge', [choice('asc', 'Stigende'), choice('desc', 'Synkende')], true), multi('missing', 'Mangler', [choice('parts', 'Stemmer'), choice('score', 'Partitur'), choice('audio', 'Lyd / lyttelenke')])], query), ...(d.canManage ? [action('works.createWork', 'Nytt verk', { status: 'active' }, workFields)] : [])] };
        }
        const d = await works.getWork({ data: { id } });
        const sections = [section('metadata', 'Om verket', workFields.filter(f => f.key !== 'title').map(f => text(f.key, f.label, String((d.work as Record<string, unknown>)[f.key] ?? '')))), section('files', 'Filer', d.files.map(f => ({ ...file(f.id, f.partName || f.fileName, f.fileName, f.kind === 'audio' ? 'audio' : 'pdf'), actions: d.canManage ? [action('works.setWorkFilePart', 'Tildel stemme', { fileId: f.id, partId: f.partId }, [select('partId', 'Stemme', partFields(d.allParts), true)]), remove('works.deleteWorkFile', 'Slett fil', { fileId: f.id })] : [] }))), section('links', 'Lytt / referanser', d.links.map(l => row(l.id, l.label || l.url, l.kind, { url: l.url, actions: d.canManage ? [remove('works.deleteWorkLink', 'Fjern lenke', { linkId: l.id })] : [] }))), section('projects', 'Brukt i', d.usedIn.map(p => link('projects/' + p.id, p.name, p.eventDate ?? '')))];
        return { title: d.work.title, sections, archive: { name: d.work.title, files: d.files.filter(f => f.kind !== 'score' || d.canViewScore).map(f => ({ path: '/api/files/' + encodeURIComponent(f.id), name: f.fileName, kind: f.kind })) }, actions: d.canManage ? [action('works.updateWork', 'Rediger verk', { id, ...valuesFor(workFields, d.work) }, workFields), action('upload.work', 'Last opp noter eller lyd', { workId: id, partId: null }, [select('partId', 'Stemme (tom = automatisk)', partFields(d.allParts), true)], { upload: 'work' }), action('upload.split', 'Del samle-PDF', { workId: id }, [select('source', 'Eksisterende PDF', options(d.files.filter(f => f.fileName.toLowerCase().endsWith('.pdf')), f => f.id, f => f.fileName), true), multi('parts', 'Stemmer', partFields(d.allParts))]), action('works.rematchWorkFiles', 'Gjenkjenn stemmer på nytt', { workId: id }), action('works.addWorkLink', 'Legg til lenke', { workId: id }, [field('url', 'Lenke', 'text', { required: true }), field('label', 'Beskrivelse')]), remove('works.deleteWork', 'Slett verk', { id })] : [] };
    }
    return null;
}

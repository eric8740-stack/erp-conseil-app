/* ============================================================
   ERP Conseil — Espace Pro
   Application 100% locale (localStorage). Aucune donnée n'est
   envoyée sur un serveur. Vanilla JS, sans dépendance.
   ============================================================ */
(() => {
'use strict';

const KEY = 'erpconseil_data_v1';
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ---------- Statuts ---------- */
const DEVIS_STATUS   = ['brouillon', 'envoye', 'accepte', 'refuse'];
const FACTURE_STATUS = ['brouillon', 'envoyee', 'payee'];
const STATUS_LABEL = {
    brouillon:'Brouillon', envoye:'Envoyé', accepte:'Accepté', refuse:'Refusé',
    envoyee:'Envoyée', payee:'Payée'
};

/* ---------- Données par défaut (pré-remplies avec vos infos) ---------- */
const DEFAULTS = {
    settings:{
        name:'ERP Conseil',
        owner:'Eric Paysant — Entrepreneur individuel',
        address:'18 route de Versanas, 87920 Condat-sur-Vienne',
        siret:'[À COMPLÉTER]',
        email:'eric.paysant@outlook.fr',
        phone:'06 21 84 90 54',
        iban:'',
        logo:'',          // dataURL du logo (base64)
        paydays:30,       // délai de paiement par défaut (jours)
        tva:'TVA non applicable, art. 293 B du CGI',
        payterms:'Paiement à 30 jours à réception de facture, par virement bancaire.',
        legal:"Eric Paysant — Entrepreneur individuel · Condat-sur-Vienne (87) · Dispensé d'immatriculation au RCS et au RM",
        validity:'1 mois',
        devprefix:'DEV',
        facprefix:'FAC',
        counters:{},  // {DEV-2026: 1, FAC-2026: 1}
        formurl:'',       // URL publique de satisfaction.html (lien d'avis envoyé aux clients)
        satendpoint:'',   // URL Apps Script …/exec pour lire les avis ET les demandes (Airtable)
        demandeFormUrl:'' // URL publique de demande.html (formulaire de demande d'intervention)
    },
    clients:[
        {id:'cl_demo', name:'A3D Design', address:'', siret:'', contact:'', email:'', phone:''}
    ],
    documents:[]
};

/* ---------- Stockage ---------- */
let DB;
function load(){
    try{ DB = JSON.parse(localStorage.getItem(KEY)) || structuredClone(DEFAULTS); }
    catch(e){ DB = structuredClone(DEFAULTS); }
    // fusion défensive des réglages
    DB.settings = Object.assign({}, DEFAULTS.settings, DB.settings || {});
    DB.settings.counters = DB.settings.counters || {};
    DB.clients   = DB.clients   || [];
    DB.documents = DB.documents || [];
}
function save(){ localStorage.setItem(KEY, JSON.stringify(DB)); }
const uid = p => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2,6);

/* ---------- Utilitaires ---------- */
const euro = n => (Number(n)||0).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' €';
const todayISO = () => new Date().toISOString().slice(0,10);
function frDate(iso){ if(!iso) return ''; const [y,m,d]=iso.split('-'); return `${d}/${m}/${y}`; }
function esc(s){ return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
const clientById = id => DB.clients.find(c => c.id === id);
function docTotal(doc){ return (doc.lines||[]).reduce((s,l)=> s + (Number(l.qty)||0)*(Number(l.pu)||0), 0); }
function addDaysISO(iso, days){ const d = new Date(iso||todayISO()); d.setDate(d.getDate()+(Number(days)||0)); return d.toISOString().slice(0,10); }
function isOverdue(doc){ return doc.type==='facture' && doc.status!=='payee' && doc.dueDate && doc.dueDate < todayISO(); }
function daysLate(iso){ return Math.floor((new Date(todayISO()) - new Date(iso)) / 86400000); }

function toast(msg, type=''){
    const t = $('#toast'); t.textContent = msg; t.className = 'toast show ' + type;
    clearTimeout(t._t); t._t = setTimeout(()=> t.className = 'toast', 2600);
}

/* ---------- Numérotation auto : PREFIX-AAAA-NNN ---------- */
function nextNumber(type){
    const s = DB.settings;
    const prefix = type === 'facture' ? s.facprefix : s.devprefix;
    const year = new Date().getFullYear();
    const key = `${prefix}-${year}`;
    const n = (s.counters[key] || 0) + 1;
    return { number:`${prefix}-${year}-${String(n).padStart(3,'0')}`, key, n };
}
function commitNumber(key,n){ DB.settings.counters[key] = n; }

/* ============================================================
   ROUTING
   ============================================================ */
function showView(name){
    $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-'+name));
    $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    $('#sidebar').classList.remove('open');
    renderView(name);
}
function renderView(name){
    if(name==='dashboard') renderDashboard();
    if(name==='devis')     renderDocList('devis');
    if(name==='factures')  renderDocList('facture');
    if(name==='bilan')     renderBilan();
    if(name==='demandes')  renderDemandes();
    if(name==='satisfaction') renderSatisfaction();
    if(name==='clients')   renderClients();
    if(name==='settings')  fillSettings();
}

/* ============================================================
   DASHBOARD
   ============================================================ */
function renderDashboard(){
    const devis    = DB.documents.filter(d=>d.type==='devis');
    const factures = DB.documents.filter(d=>d.type==='facture');
    const accepted = devis.filter(d=>d.status==='accepte');
    const sent     = devis.filter(d=>d.status==='envoye');
    const caFacture= factures.reduce((s,f)=>s+docTotal(f),0);
    const caPaye   = factures.filter(f=>f.status==='payee').reduce((s,f)=>s+docTotal(f),0);
    const enAttente= factures.filter(f=>f.status!=='payee').reduce((s,f)=>s+docTotal(f),0);
    const txAccept = devis.length ? Math.round(accepted.length/devis.length*100) : 0;

    $('#kpiGrid').innerHTML = `
        ${kpi('CA facturé', euro(caFacture), `${factures.length} facture(s)`)}
        ${kpi('Encaissé', euro(caPaye), `Reste ${euro(enAttente)}`)}
        ${kpi('Devis en attente', sent.length, `Valeur ${euro(sent.reduce((s,d)=>s+docTotal(d),0))}`)}
        ${kpi("Taux d'acceptation", txAccept+' %', `${accepted.length}/${devis.length} accepté(s)`)}
    `;
    renderRelances(factures);
    $('#recentDevis').innerHTML    = miniList(devis);
    $('#recentFactures').innerHTML = miniList(factures);
    bindMiniRows();
}
function renderRelances(factures){
    const late = factures.filter(isOverdue).sort((a,b)=>(a.dueDate||'').localeCompare(b.dueDate||''));
    const box = $('#relancesCard');
    if(!late.length){ box.innerHTML=''; return; }
    const totalLate = late.reduce((s,f)=>s+docTotal(f),0);
    box.innerHTML = `<div class="relance-card">
        <div class="rc-head">⚠ ${late.length} facture(s) en retard de paiement · ${euro(totalLate)}</div>
        ${late.map(f=>{ const c=clientById(f.clientId);
            return `<div class="relance-row" data-open="${f.id}">
                <div class="mini-info"><div class="mini-num">${esc(f.number)}</div><div class="mini-name">${esc(c?c.name:'—')}</div></div>
                <div style="text-align:right">
                    <div class="amount">${euro(docTotal(f))}</div>
                    <div class="relance-late">échéance ${frDate(f.dueDate)} · +${daysLate(f.dueDate)} j</div>
                </div>
            </div>`;}).join('')}
    </div>`;
}
const kpi = (label,val,sub) => `<div class="kpi"><div class="kpi-label">${label}</div><div class="kpi-value">${val}</div><div class="kpi-sub">${esc(sub)}</div></div>`;

function miniList(docs){
    const recent = [...docs].sort((a,b)=> (b.date||'').localeCompare(a.date||'')).slice(0,5);
    if(!recent.length) return `<div class="empty small">Aucun document pour l'instant.</div>`;
    return recent.map(d=>{
        const c = clientById(d.clientId);
        return `<div class="mini-row" data-open="${d.id}">
            <div class="mini-info">
                <div class="mini-num">${esc(d.number)}</div>
                <div class="mini-name">${esc(c?c.name:'—')}</div>
            </div>
            <div style="text-align:right">
                <div class="amount">${euro(docTotal(d))}</div>
                <span class="badge ${d.status}">${STATUS_LABEL[d.status]}</span>
            </div>
        </div>`;
    }).join('');
}
function bindMiniRows(){ $$('.mini-row,.relance-row').forEach(r=> r.onclick=()=> openDoc(r.dataset.open)); }

/* ============================================================
   LISTES DEVIS / FACTURES
   ============================================================ */
function renderDocList(type){
    const isFac = type==='facture';
    const searchEl = $(isFac?'#facturesSearch':'#devisSearch');
    const q = (searchEl.value||'').toLowerCase();
    let docs = DB.documents.filter(d=>d.type===type);
    if(q) docs = docs.filter(d=>{
        const c = clientById(d.clientId);
        return d.number.toLowerCase().includes(q) || (c&&c.name.toLowerCase().includes(q));
    });
    docs.sort((a,b)=> (b.number||'').localeCompare(a.number||''));

    $(isFac?'#facturesCount':'#devisCount').textContent =
        `${docs.length} ${isFac?'facture':'devis'}${docs.length>1?'s':''}`;

    const table = $(isFac?'#facturesTable':'#devisTable');
    if(!docs.length){
        table.innerHTML = `<tbody><tr><td><div class="empty"><div class="big">${isFac?'🧾':'✎'}</div>Aucun ${isFac?'facture':'devis'}.<br><br><button class="btn btn-primary" data-new="${isFac?'facture':'devis'}">+ Créer ${isFac?'une facture':'un devis'}</button></div></td></tr></tbody>`;
        bindNewButtons(); return;
    }
    table.innerHTML = `
        <thead><tr>
            <th>Numéro</th><th>Date</th><th>Client</th><th>Statut</th><th class="amount">Montant</th>
        </tr></thead>
        <tbody>${docs.map(d=>{
            const c = clientById(d.clientId);
            return `<tr data-open="${d.id}">
                <td class="num-cell">${esc(d.number)}</td>
                <td>${frDate(d.date)}</td>
                <td>${esc(c?c.name:'—')}</td>
                <td><span class="badge ${d.status}">${STATUS_LABEL[d.status]}</span>${isOverdue(d)?' <span class="badge retard">En retard</span>':''}</td>
                <td class="amount">${euro(docTotal(d))}</td>
            </tr>`;
        }).join('')}</tbody>`;
    $$('tr[data-open]', table).forEach(tr=> tr.onclick=()=> openDoc(tr.dataset.open));
}

/* ============================================================
   ÉDITEUR DE DOCUMENT (devis / facture)
   ============================================================ */
let editing = null;          // doc en cours d'édition
let pendingNumberKey = null; // pour ne consommer le compteur qu'à l'enregistrement

function newDoc(type){
    const { number, key, n } = nextNumber(type);
    pendingNumberKey = { key, n };
    editing = {
        id:null, type, number, status:'brouillon',
        date: todayISO(),
        validity: DB.settings.validity,
        dueDate: type==='facture' ? addDaysISO(todayISO(), DB.settings.paydays) : '',
        paidDate:'',
        clientId: DB.clients[0]?.id || '',
        objet:'',
        lines:[ {designation:'', qty:1, unit:'forfait', pu:0} ],
        notes:''
    };
    openDocModal();
}
function openDoc(id){
    const d = DB.documents.find(x=>x.id===id); if(!d) return;
    pendingNumberKey = null;
    editing = structuredClone(d);
    openDocModal();
}
function openDocModal(){
    const isFac = editing.type==='facture';
    $('#docModalTitle').textContent = (isFac?'Facture ':'Devis ') + editing.number;
    $('#doc-number').value   = editing.number;
    $('#doc-date').value     = editing.date;
    $('#doc-validity').value = editing.validity || '';
    $('#doc-validity-wrap').style.display = isFac ? 'none' : '';
    $('#doc-echeance').value = editing.dueDate || '';
    $('#doc-paid').value     = editing.paidDate || '';
    $('#doc-echeance-wrap').style.display = isFac ? '' : 'none';
    $('#doc-objet').value    = editing.objet || '';
    $('#doc-notes').value    = editing.notes || '';
    $('#doc-tvanote').textContent = DB.settings.tva;

    // statut
    const statuses = isFac ? FACTURE_STATUS : DEVIS_STATUS;
    $('#doc-status').innerHTML = statuses.map(s=>`<option value="${s}">${STATUS_LABEL[s]}</option>`).join('');
    $('#doc-status').value = editing.status;
    updatePaidVisibility();

    // clients
    fillClientSelect($('#doc-client'), editing.clientId);

    renderLines();
    $('#deleteDoc').hidden  = !editing.id;
    // convertir : seulement pour un devis existant accepté/envoyé
    $('#convertDoc').hidden = !(editing.type==='devis' && editing.id);

    openModal('#docModal');
}
function updatePaidVisibility(){
    const isFac = editing.type==='facture';
    const paid = $('#doc-status').value==='payee';
    $('#doc-paid-wrap').style.display = (isFac && paid) ? '' : 'none';
    if(isFac && paid && !$('#doc-paid').value) $('#doc-paid').value = todayISO();
}
function fillClientSelect(sel, current){
    sel.innerHTML = DB.clients.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')
        + `<option value="__new">+ Nouveau client…</option>`;
    sel.value = current || (DB.clients[0]?.id||'__new');
}

function renderLines(){
    const wrap = $('#doc-lines');
    wrap.innerHTML = editing.lines.map((l,i)=>`
        <div class="line-row" data-i="${i}">
            <input class="line-desc" data-f="designation" value="${esc(l.designation)}" placeholder="Désignation de la prestation">
            <input data-f="qty"  type="number" min="0" step="0.5" value="${l.qty}">
            <input data-f="unit" value="${esc(l.unit)}" placeholder="unité">
            <input data-f="pu"   type="number" min="0" step="0.01" value="${l.pu}">
            <span class="line-total">${euro((Number(l.qty)||0)*(Number(l.pu)||0))}</span>
            <button class="line-del" title="Supprimer">✕</button>
        </div>`).join('');
    $$('.line-row', wrap).forEach(row=>{
        const i = +row.dataset.i;
        $$('input', row).forEach(inp=> inp.oninput = ()=>{
            editing.lines[i][inp.dataset.f] = inp.value;
            row.querySelector('.line-total').textContent = euro((Number(editing.lines[i].qty)||0)*(Number(editing.lines[i].pu)||0));
            updateTotals();
        });
        row.querySelector('.line-del').onclick = ()=>{
            editing.lines.splice(i,1);
            if(!editing.lines.length) editing.lines.push({designation:'',qty:1,unit:'forfait',pu:0});
            renderLines(); updateTotals();
        };
    });
    updateTotals();
}
function updateTotals(){
    const t = docTotal(editing);
    $('#doc-totalht').textContent  = euro(t);
    $('#doc-totalnet').textContent = euro(t);
}
function collectDoc(){
    editing.number   = $('#doc-number').value.trim();
    editing.date     = $('#doc-date').value;
    editing.validity = $('#doc-validity').value;
    editing.status   = $('#doc-status').value;
    editing.clientId = $('#doc-client').value;
    editing.objet    = $('#doc-objet').value.trim();
    editing.notes    = $('#doc-notes').value;
    if(editing.type==='facture'){
        editing.dueDate  = $('#doc-echeance').value;
        editing.paidDate = $('#doc-status').value==='payee' ? ($('#doc-paid').value||todayISO()) : '';
    }
}
function saveDoc(){
    collectDoc();
    if(editing.clientId === '__new'){ toast('Choisissez ou créez un client d’abord.', 'err'); return; }
    if(!editing.clientId){ toast('Sélectionnez un client.', 'err'); return; }
    editing.lines = editing.lines.filter(l=> (l.designation||'').trim() !== '');
    if(!editing.lines.length){ toast('Ajoutez au moins une ligne.', 'err'); return; }

    if(editing.id){
        const idx = DB.documents.findIndex(d=>d.id===editing.id);
        DB.documents[idx] = editing;
    }else{
        editing.id = uid('doc');
        DB.documents.push(editing);
        if(pendingNumberKey) commitNumber(pendingNumberKey.key, pendingNumberKey.n);
    }
    save(); closeModal('#docModal');
    toast('Document enregistré', 'ok');
    showView(editing.type==='facture'?'factures':'devis');
}
function deleteDoc(){
    if(!editing.id) return;
    if(!confirm('Supprimer définitivement ce document ?')) return;
    DB.documents = DB.documents.filter(d=>d.id!==editing.id);
    save(); closeModal('#docModal'); toast('Document supprimé');
    showView(editing.type==='facture'?'factures':'devis');
}
function convertToFacture(){
    collectDoc();
    const { number, key, n } = nextNumber('facture');
    commitNumber(key, n);
    const fac = {
        id: uid('doc'), type:'facture', number, status:'brouillon',
        date: todayISO(), validity:'',
        dueDate: addDaysISO(todayISO(), DB.settings.paydays), paidDate:'',
        clientId: editing.clientId,
        lines: structuredClone(editing.lines), notes: editing.notes,
        sourceDevis: editing.number
    };
    DB.documents.push(fac);
    // marquer le devis accepté
    if(editing.id){
        editing.status='accepte';
        const idx=DB.documents.findIndex(d=>d.id===editing.id);
        if(idx>=0) DB.documents[idx]=editing;
    }
    save(); closeModal('#docModal');
    toast('Facture '+number+' créée', 'ok');
    openDoc(fac.id);
}

/* ============================================================
   IMPRESSION / PDF
   ============================================================ */
function printDoc(){
    collectDoc();
    const s = DB.settings, c = clientById(editing.clientId) || {};
    const isFac = editing.type==='facture';
    const total = docTotal(editing);
    const rows = editing.lines.map((l,i)=>`
        <tr>
            <td>${i+1}</td>
            <td>${esc(l.designation)}</td>
            <td class="r">${l.qty}</td>
            <td>${esc(l.unit)}</td>
            <td class="r">${euro(l.pu)}</td>
            <td class="r">${euro((Number(l.qty)||0)*(Number(l.pu)||0))}</td>
        </tr>`).join('');

    $('#printArea').innerHTML = `
    <div class="doc-sheet">
        <header class="doc-head">
            <div class="dh-brand">
                ${s.logo
                    ? `<img class="doc-logo" src="${s.logo}" alt="${esc(s.name)}">`
                    : `<div class="dc-name">${escNameBrand(s.name)}</div>`}
            </div>
            <div class="doc-meta">
                <div class="dm-type">${isFac?'Facture':'Devis'}</div>
                <p class="dm-num">N° ${esc(editing.number)}</p>
                <p>Date : ${frDate(editing.date)}</p>
                ${!isFac && editing.validity ? `<p>Validité : ${esc(editing.validity)}</p>`:''}
                ${isFac && editing.dueDate ? `<p>Échéance : ${frDate(editing.dueDate)}</p>`:''}
                ${isFac && editing.sourceDevis ? `<p>Réf. devis : ${esc(editing.sourceDevis)}</p>`:''}
            </div>
        </header>

        <div class="doc-parties">
            <div class="doc-party">
                <div class="dp-title">Émetteur</div>
                <p class="dp-strong">${esc(s.owner)}</p>
                <p>${esc(s.address)}</p>
                ${s.siret?`<p>SIRET : ${esc(s.siret)}</p>`:''}
                <p>${esc(s.email)} · ${esc(s.phone)}</p>
            </div>
            <div class="doc-party doc-party-client">
                <div class="dp-title">Client</div>
                <p class="dp-strong">${esc(c.name||'—')}</p>
                ${c.address?`<p>${esc(c.address)}</p>`:''}
                ${c.siret?`<p>SIRET : ${esc(c.siret)}</p>`:''}
                ${c.contact?`<p>${esc(c.contact)}</p>`:''}
                ${c.email?`<p>${esc(c.email)}</p>`:''}
            </div>
        </div>

        ${editing.objet?`<div class="doc-objet"><span class="do-label">Objet :</span> ${esc(editing.objet)}</div>`:''}

        <table class="doc-table">
            <colgroup>
                <col class="c-num"><col class="c-desc"><col class="c-qty"><col class="c-unit"><col class="c-pu"><col class="c-tot">
            </colgroup>
            <thead><tr><th>#</th><th>Désignation</th><th class="r">Qté</th><th>Unité</th><th class="r">P.U. HT</th><th class="r">Total HT</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>

        <div class="doc-totals">
            <table>
                <tr><td class="tt-label">Total HT</td><td class="tt-val">${euro(total)}</td></tr>
                <tr class="tt-net"><td>Net à payer</td><td class="tt-val">${euro(total)}</td></tr>
            </table>
            <div class="doc-tva">${esc(s.tva)}</div>
        </div>

        <div class="doc-conditions">
            <h4>Conditions de règlement</h4>
            <p>${esc(s.payterms)}</p>
            <p>Pénalités de retard : 3 × taux d'intérêt légal. Indemnité forfaitaire de recouvrement : 40 €.</p>
            ${s.iban?`<p>IBAN : ${esc(s.iban)}</p>`:''}
        </div>

        ${!isFac ? `<div class="doc-sign">
            <div class="ds-box">
                <span class="ds-label">Bon pour accord</span>
                <span class="ds-hint">Date et signature du client, précédées de la mention « Bon pour accord »</span>
                <div class="ds-line"></div>
            </div>
        </div>`:''}

        <div class="doc-foot">${esc(s.legal)}</div>
    </div>`;

    setTimeout(()=> window.print(), 60);
}
function escNameBrand(name){
    // met en valeur le 2e mot comme sur le logo
    const parts = esc(name).split(' ');
    if(parts.length>1) return `${parts[0]} <span class="dot">${parts.slice(1).join(' ')}</span>`;
    return esc(name);
}

/* ============================================================
   BILAN ANNUEL
   ============================================================ */
const MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
function availableYears(){
    const ys = new Set(DB.documents.filter(d=>d.type==='facture'&&d.date).map(d=>d.date.slice(0,4)));
    ys.add(String(new Date().getFullYear()));
    return [...ys].sort().reverse();
}
function renderBilan(){
    const sel = $('#bilanYear');
    const years = availableYears();
    const current = sel.value && years.includes(sel.value) ? sel.value : years[0];
    sel.innerHTML = years.map(y=>`<option value="${y}">${y}</option>`).join('');
    sel.value = current;

    const factures = DB.documents.filter(d=>d.type==='facture' && (d.date||'').startsWith(current));
    const paid = factures.filter(f=>f.status==='payee');
    const caFacture = factures.reduce((s,f)=>s+docTotal(f),0);
    const caPaye = paid.reduce((s,f)=>s+docTotal(f),0);
    const devisAcc = DB.documents.filter(d=>d.type==='devis'&&d.status==='accepte'&&(d.date||'').startsWith(current)).length;

    $('#bilanKpi').innerHTML = `
        ${kpi('CA facturé '+current, euro(caFacture), `${factures.length} facture(s)`)}
        ${kpi('Encaissé '+current, euro(caPaye), `${paid.length} payée(s)`)}
        ${kpi('Reste à encaisser', euro(caFacture-caPaye), `${factures.length-paid.length} en attente`)}
        ${kpi('Devis acceptés', devisAcc, current)}
    `;

    // détail mensuel : facturé (par date d'émission), encaissé (par date de paiement)
    const fByM = Array(12).fill(0), fCount = Array(12).fill(0), pByM = Array(12).fill(0);
    factures.forEach(f=>{ const m=+f.date.slice(5,7)-1; fByM[m]+=docTotal(f); fCount[m]++; });
    paid.forEach(f=>{ const d=f.paidDate||f.date; const m=+d.slice(5,7)-1; pByM[m]+=docTotal(f); });

    $('#bilanTable').innerHTML = `
        <thead><tr><th>Mois</th><th class="amount">Factures</th><th class="amount">CA facturé HT</th><th class="amount">Encaissé HT</th></tr></thead>
        <tbody>${MONTHS.map((m,i)=>`<tr><td>${m}</td><td class="amount">${fCount[i]||''}</td><td class="amount">${fByM[i]?euro(fByM[i]):'—'}</td><td class="amount">${pByM[i]?euro(pByM[i]):'—'}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td>Total ${current}</td><td class="amount">${factures.length}</td><td class="amount">${euro(caFacture)}</td><td class="amount">${euro(caPaye)}</td></tr></tfoot>`;
}
function exportCsv(){
    const year = $('#bilanYear').value;
    const rows = [['Numéro','Date','Échéance','Client','Statut','Date encaissement','Montant HT']];
    DB.documents.filter(d=>d.type==='facture'&&(d.date||'').startsWith(year))
        .sort((a,b)=>(a.number||'').localeCompare(b.number||''))
        .forEach(f=>{ const c=clientById(f.clientId);
            rows.push([f.number, frDate(f.date), frDate(f.dueDate), c?c.name:'', STATUS_LABEL[f.status], frDate(f.paidDate), docTotal(f).toFixed(2)]);
        });
    const csv = '﻿' + rows.map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
    a.download = `erp-conseil-factures-${year}.csv`; a.click(); URL.revokeObjectURL(a.href);
    toast('Export CSV généré', 'ok');
}

/* ============================================================
   DEMANDES D'INTERVENTION (via Airtable / Google Apps Script)
   Lecture : même endpoint que la satisfaction + ?type=demande
   ============================================================ */
let demCache = null;
let currentDemande = null;
const TYPE_BESOIN_LABEL = ['Tableau de bord Power BI','Automatisation Excel / VBA',
    "Correction d'un fichier existant",'Extraction / analyse de données (SQL)','Formation','Je ne sais pas trop'];

function renderDemandes(force){
    const box = $('#demBody');
    const ep  = (DB.settings.satendpoint||'').trim();
    if(!ep){ box.innerHTML = demHelp(); bindDemHelp(); return; }

    if(demCache && !force){ renderDemList(demCache); return; }
    box.innerHTML = `<div class="empty"><div class="big">⏳</div>Chargement des demandes…</div>`;
    fetch(ep + (ep.includes('?')?'&':'?') + 'type=demande')
        .then(r=>r.json())
        .then(data=>{
            const records = (data.records||[]).map(r=> r && r.fields ? r.fields : r);
            demCache = records;
            renderDemList(records);
        })
        .catch(()=>{ box.innerHTML = `<div class="empty"><div class="big">⚠</div>Impossible de charger les demandes.<br><span class="small">Vérifiez l'endpoint dans Réglages et que la table « Demandes » existe (fonction setupDemandes).</span></div>`; });
}

function renderDemList(records){
    const box = $('#demBody');
    if(!records.length){
        box.innerHTML = `<div class="empty"><div class="big">📨</div>Aucune demande pour l'instant.<br><span class="small">Partagez le lien de votre formulaire de demande.</span></div>`;
        return;
    }
    const total     = records.length;
    const nouvelles = records.filter(r=> (r.Statut||'')==='Nouvelle').length;
    const surSite   = records.filter(r=> (r["Mode d'intervention"]||'')==='Sur site').length;
    const sorted    = [...records].sort((a,b)=> String(b.Date||'').localeCompare(String(a.Date||'')));

    box.innerHTML = `
        <div class="kpi-grid">
            ${kpi('Demandes reçues', total, 'au total')}
            ${kpi('Nouvelles', nouvelles, 'à traiter')}
            ${kpi('Sur site', surSite, 'déplacement requis')}
        </div>
        <div class="cards-grid">${sorted.map((r,i)=>demCard(r,i)).join('')}</div>`;
    $$('.dem-card', box).forEach(c=> c.onclick=()=> openDemandeDetail(sorted[+c.dataset.i]));
}

function demTypes(r){ const t=r['Type de besoin']; return Array.isArray(t)?t:(t?[t]:[]); }
function statutClass(s){ return s==='Traitée'?'accepte':(s==='Devis envoyé'?'facture':'envoye'); }

function demCard(r,i){
    const types  = demTypes(r);
    const mode   = r["Mode d'intervention"]||'';
    const statut = r.Statut||'Nouvelle';
    return `<div class="client-card dem-card" data-i="${i}">
        <div class="dem-card-head">
            <h3>${esc(r['Société']||r.Contact||'—')}</h3>
            <span class="badge ${statutClass(statut)}">${esc(statut)}</span>
        </div>
        ${types.length?`<div class="dem-tags">${types.map(t=>`<span class="badge facture">${esc(t)}</span>`).join('')}</div>`:''}
        <div class="dem-meta">
            ${mode?`<span class="badge ${mode==='Sur site'?'retard':'envoye'}">${mode==='Sur site'?'⚠ ':''}${esc(mode)}</span>`:''}
            ${r['Délai souhaité']?`<span class="muted small">${esc(r['Délai souhaité'])}</span>`:''}
            ${r.Date?`<span class="muted small">${frDate(String(r.Date).slice(0,10))}</span>`:''}
        </div>
    </div>`;
}

function openDemandeDetail(rec){
    currentDemande = rec;
    const types = demTypes(rec);
    const row = (label,val)=> val ? `<div class="dd-row"><span class="dd-label">${label}</span><span class="dd-val">${esc(val)}</span></div>` : '';
    $('#demandeDetailTitle').textContent = rec['Société']||rec.Contact||'Demande';
    $('#demandeDetailBody').innerHTML = `
        ${types.length?`<div class="dd-row"><span class="dd-label">Type de besoin</span><span class="dd-val">${types.map(t=>`<span class="badge facture">${esc(t)}</span>`).join(' ')}</span></div>`:''}
        ${row('Statut', rec.Statut)}
        ${row('Personne à contacter', rec.Contact)}
        ${row('Email', rec.Email)}
        ${row('Téléphone', rec['Téléphone'])}
        ${row('Description', rec['Description du besoin'])}
        ${row('Outils utilisés', rec['Outils utilisés'])}
        ${row("Mode d'intervention", rec["Mode d'intervention"])}
        ${row('Adresse du site', rec['Adresse du site'])}
        ${row('Contact sur place', rec['Contact sur place'])}
        ${row('Délai souhaité', rec['Délai souhaité'])}
        ${row('Budget indicatif', rec['Budget indicatif'])}
        ${row('Date', rec.Date?frDate(String(rec.Date).slice(0,10)):'')}`;
    openModal('#demandeModal');
}

/* Conversion d'une demande en nouveau devis (crée/complète le client) */
function convertDemandeToDevis(rec){
    if(!rec) return;
    const email = (rec.Email||'').trim().toLowerCase();
    const name  = (rec['Société']||rec.Contact||'').trim();
    const info = {
        contact: (rec.Contact||'').trim(),
        email:   (rec.Email||'').trim(),
        phone:   (rec['Téléphone']||'').trim(),
        address: (rec['Adresse du site']||'').trim()
    };
    let cl = (email && DB.clients.find(c=> (c.email||'').trim().toLowerCase()===email))
          || (name  && DB.clients.find(c=> (c.name||'').trim().toLowerCase()===name.toLowerCase()));
    if(!cl){
        cl = { id:uid('cl'), name:name||'Client', address:info.address, siret:'',
               contact:info.contact, email:info.email, phone:info.phone };
        DB.clients.push(cl); save();
        toast('Client « '+cl.name+' » créé', 'ok');
    } else {
        let changed = false;                            // ne complète que les champs vides
        ['contact','email','phone','address'].forEach(f=>{
            if(!((cl[f]||'').trim()) && info[f]){ cl[f]=info[f]; changed=true; }
        });
        if(changed){ save(); toast('Fiche client « '+cl.name+' » complétée', 'ok'); }
    }

    // une ligne par type de besoin coché ; sinon une ligne avec la description
    const types = demTypes(rec);
    const desc  = (rec['Description du besoin']||'').trim();
    const lines = types.length
        ? types.map(t=> ({ designation:t, qty:1, unit:'forfait', pu:0 }))
        : [ { designation:(desc || 'Prestation'), qty:1, unit:'forfait', pu:0 } ];

    const { number, key, n } = nextNumber('devis');
    pendingNumberKey = { key, n };
    editing = {
        id:null, type:'devis', number, status:'brouillon',
        date: todayISO(), validity: DB.settings.validity,
        dueDate:'', paidDate:'',
        clientId: cl.id,
        objet: types.length ? types.join(', ') : firstSentence(desc),  // résumé court (imprimé)
        lines: lines,
        notes: buildDemandeNote(rec, types, desc)    // note interne (non imprimée)
    };
    closeModal('#demandeModal');
    openDocModal();
}

/* Première phrase d'un texte (pour un objet court) */
function firstSentence(t){
    t = (t||'').trim();
    if(!t) return '';
    const m = t.match(/^[^.!?\n]+[.!?]?/);
    return (m ? m[0] : t).trim();
}

/* Récapitulatif structuré de la demande → note interne du devis (champs renseignés seulement) */
function buildDemandeNote(rec, types, desc){
    const L = [];
    const date = rec.Date ? frDate(String(rec.Date).slice(0,10)) : '';
    L.push('Demande' + (date ? (' du ' + date) : ''));
    const ct = [rec.Contact, rec.Email, rec['Téléphone']].map(x=>(x||'').trim()).filter(Boolean);
    if(ct.length)    L.push('Contact : ' + ct.join(' · '));
    if(types.length) L.push('Besoin(s) : ' + types.join(', '));
    if(desc)         L.push('Description : ' + desc);
    const outils = (rec['Outils utilisés']||'').trim();
    if(outils)       L.push('Outils utilisés : ' + outils);
    const mode = (rec["Mode d'intervention"]||'').trim();
    if(mode){
        let m = 'Mode : ' + mode;
        if(mode === 'Sur site'){
            const extra = [];
            const adr = (rec['Adresse du site']||'').trim();
            const cs  = (rec['Contact sur place']||'').trim();
            if(adr) extra.push('Adresse : ' + adr);
            if(cs)  extra.push('Contact sur place : ' + cs);
            if(extra.length) m += ' — ' + extra.join(' · ');
        }
        L.push(m);
    }
    const db = [];
    const delai  = (rec['Délai souhaité']||'').trim();
    const budget = (rec['Budget indicatif']||'').trim();
    if(delai)  db.push('Délai : ' + delai);
    if(budget) db.push('Budget indicatif : ' + budget);
    if(db.length) L.push(db.join(' · '));
    return L.join('\n');
}

function demHelp(){
    return `<div class="card">
        <div class="card-head"><h2>Activer les demandes d'intervention</h2></div>
        <p class="muted">Recevez les demandes de vos prospects via un formulaire public. Elles sont enregistrées dans votre base Airtable (table « Demandes ») grâce au même relais Google Apps Script que la satisfaction.</p>
        <ol class="sat-steps">
            <li>Mettez à jour <code>google-apps-script/Code.gs</code> (v2), lancez une fois la fonction <code>setupDemandes</code>, puis redéployez une « Nouvelle version ».</li>
            <li>Dans <b>Réglages → Satisfaction client</b>, l'« Endpoint de lecture des avis » doit être renseigné (il sert aussi aux demandes).</li>
            <li>Dans <b>Réglages → Demandes d'intervention</b>, collez le lien public de <code>demande.html</code>.</li>
            <li>Revenez ici : les demandes reçues s'afficheront.</li>
        </ol>
        <div class="settings-actions"><button class="btn btn-primary" id="demGoSettings">Aller dans les Réglages</button></div>
    </div>`;
}
function bindDemHelp(){ const b=$('#demGoSettings'); if(b) b.onclick=()=>showView('settings'); }

/* ---------- Copie presse-papier générique ---------- */
function copyToClipboard(text){
    if(!text){ toast('Rien à copier.', 'err'); return; }
    if(navigator.clipboard && window.isSecureContext){
        navigator.clipboard.writeText(text).then(()=>toast('Lien copié', 'ok'), ()=>execCopy(text));
    } else execCopy(text);
}
function execCopy(text){
    const ta=document.createElement('textarea');
    ta.value=text; ta.style.position='fixed'; ta.style.opacity='0';
    document.body.appendChild(ta); ta.focus(); ta.select();
    try{ document.execCommand('copy'); toast('Lien copié', 'ok'); }
    catch(e){ toast('Copie impossible.', 'err'); }
    document.body.removeChild(ta);
}

/* ============================================================
   SATISFACTION CLIENT (avis via Airtable / Google Apps Script)
   ============================================================ */
let satCache = null;   // mémorise les avis chargés pour éviter de refaire le fetch

function renderSatisfaction(force){
    const box = $('#satBody');
    const ep  = (DB.settings.satendpoint||'').trim();
    if(!ep){ box.innerHTML = satHelp(); bindSatHelp(); return; }      // endpoint non configuré → aide

    if(satCache && !force){ renderSatStats(satCache); return; }       // déjà chargé
    box.innerHTML = `<div class="empty"><div class="big">⏳</div>Chargement des avis…</div>`;
    fetch(ep)
        .then(r=>r.json())
        .then(data=>{
            const records = (data.records||[]).map(r=> r && r.fields ? r.fields : r);
            satCache = records;
            renderSatStats(records);
        })
        .catch(()=>{ box.innerHTML = `<div class="empty"><div class="big">⚠</div>Impossible de charger les avis.<br><span class="small">Vérifiez l'URL de l'endpoint dans Réglages.</span></div>`; });
}

function renderSatStats(records){
    const box = $('#satBody');
    if(!records.length){
        box.innerHTML = `<div class="empty"><div class="big">⭐</div>Aucun avis pour l'instant.<br><span class="small">Générez un lien d'avis et envoyez-le à vos clients après une mission.</span></div>`;
        return;
    }
    const notes   = records.map(r=> Number(r['Note globale'])||0).filter(n=>n>0);
    const avg     = notes.length ? notes.reduce((a,b)=>a+b,0)/notes.length : 0;
    const reco    = records.filter(r=> (r.Recommandation||'')==='Oui').length;
    const recoPct = records.length ? Math.round(reco/records.length*100) : 0;
    const toPub   = records.filter(r=> r['Publier sur le site']===true).length;

    const dist=[0,0,0,0,0];                                            // répartition 1→5
    notes.forEach(n=>{ const i=Math.min(5,Math.max(1,Math.round(n)))-1; dist[i]++; });
    const maxD = Math.max(1,...dist);

    box.innerHTML = `
        <div class="kpi-grid">
            ${kpi('Note moyenne', `${stars(avg)} <span class="sat-avg">${avg.toFixed(1)}/5</span>`, `${notes.length} avis noté(s)`)}
            ${kpi("Nombre d'avis", records.length, `${toPub} à publier sur le site`)}
            ${kpi('Recommandation', recoPct+' %', `${reco} client(s) recommandent`)}
        </div>
        <div class="card">
            <div class="card-head"><h2>Répartition des notes</h2></div>
            ${[5,4,3,2,1].map(s=>{ const c=dist[s-1]; const w=Math.round(c/maxD*100);
                return `<div class="sat-bar-row"><span class="sat-bar-label">${s} ★</span><div class="sat-bar"><div class="sat-bar-fill" style="width:${w}%"></div></div><span class="sat-bar-count">${c}</span></div>`;
            }).join('')}
        </div>
        <div class="card">
            <div class="card-head"><h2>Derniers avis</h2></div>
            <div class="sat-list">${records.slice(0,30).map(satReviewRow).join('')}</div>
        </div>`;
}

function satReviewRow(r){
    const note = Number(r['Note globale'])||0;
    const date = r.Date ? frDate(String(r.Date).slice(0,10)) : '';
    const pub  = r['Publier sur le site']===true;
    return `<div class="sat-review">
        <div class="sat-review-head">
            <div class="mini-info"><strong>${esc(r.Client||'Client')}</strong>${r.Mission?` · <span class="muted small">${esc(r.Mission)}</span>`:''}</div>
            <div class="sat-review-meta">${stars(note)}${pub?' <span class="badge accepte">À publier</span>':''}</div>
        </div>
        ${r.Commentaire?`<p class="sat-comment">« ${esc(r.Commentaire)} »</p>`:''}
        <div class="sat-review-foot muted small">${r.Recommandation?`Recommande : ${esc(r.Recommandation)}`:''}${date?` · ${date}`:''}${r.Email?` · ${esc(r.Email)}`:''}</div>
    </div>`;
}

function stars(n){
    const full = Math.round(Number(n)||0);
    let s='';
    for(let i=1;i<=5;i++) s += `<span class="star${i<=full?' on':''}">★</span>`;
    return `<span class="stars">${s}</span>`;
}

function satHelp(){
    return `<div class="card">
        <div class="card-head"><h2>Activer la satisfaction client</h2></div>
        <p class="muted">Recueillez l'avis de vos clients après chaque mission. Les réponses sont enregistrées dans votre base Airtable via un petit script Google (gratuit) — aucune donnée ne transite par ce site.</p>
        <ol class="sat-steps">
            <li>Ouvrez le fichier <code>google-apps-script/Code.gs</code> du dépôt et suivez les 4 étapes d'installation (jeton Airtable, script, propriété <code>AIRTABLE_TOKEN</code>, déploiement en application web).</li>
            <li>Copiez l'URL de déploiement qui se termine par <code>/exec</code>.</li>
            <li>Dans <b>Réglages → Satisfaction client</b> : collez cette URL dans « Endpoint de lecture des avis », l'adresse de <code>satisfaction.html</code> dans « URL du formulaire d'avis », puis enregistrez.</li>
            <li>Revenez ici : note moyenne, taux de recommandation et avis s'afficheront.</li>
        </ol>
        <div class="settings-actions"><button class="btn btn-primary" id="satGoSettings">Aller dans les Réglages</button></div>
    </div>`;
}
function bindSatHelp(){ const b=$('#satGoSettings'); if(b) b.onclick=()=>showView('settings'); }

/* ---------- Génération d'un lien d'avis ---------- */
function buildReviewUrl(clientName, mission){
    const base = (DB.settings.formurl||'').trim();
    if(!base) return '';
    const u = base.split('#')[0];
    const params = [];
    if(clientName) params.push('client='+encodeURIComponent(clientName));
    if(mission)    params.push('mission='+encodeURIComponent(mission));
    if(!params.length) return u;
    return u + (u.includes('?') ? '&' : '?') + params.join('&');
}
function openReviewModal(clientId, mission){
    if(!(DB.settings.formurl||'').trim()){
        toast("Renseignez d'abord l'URL du formulaire dans Réglages.", 'err');
        showView('settings'); return;
    }
    const sel = $('#rv-client');
    sel.innerHTML = DB.clients.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
    if(clientId) sel.value = clientId;
    $('#rv-mission').value = mission || '';
    updateReviewUrl();
    openModal('#reviewModal');
}
function updateReviewUrl(){
    const c = clientById($('#rv-client').value);
    $('#rv-url').value = buildReviewUrl(c?c.name:'', $('#rv-mission').value.trim());
}
function copyReviewLink(){
    const v = $('#rv-url').value;
    if(!v){ toast('Lien indisponible.', 'err'); return; }
    if(navigator.clipboard && window.isSecureContext){
        navigator.clipboard.writeText(v).then(()=>toast('Lien copié', 'ok'), fallbackCopyReview);
    } else fallbackCopyReview();
}
function fallbackCopyReview(){
    const ta=$('#rv-url'); ta.focus(); ta.select();
    try{ document.execCommand('copy'); toast('Lien copié', 'ok'); }
    catch(e){ toast('Copie impossible — sélectionnez le lien manuellement.', 'err'); }
}

/* ============================================================
   CLIENTS
   ============================================================ */
function renderClients(){
    const q = ($('#clientsSearch').value||'').toLowerCase();
    let list = DB.clients;
    if(q) list = list.filter(c=> c.name.toLowerCase().includes(q));
    $('#clientsCount').textContent = `${DB.clients.length} client${DB.clients.length>1?'s':''}`;
    const grid = $('#clientsGrid');
    if(!list.length){ grid.innerHTML = `<div class="empty"><div class="big">👥</div>Aucun client.</div>`; return; }
    grid.innerHTML = list.map(c=>{
        const docs = DB.documents.filter(d=>d.clientId===c.id);
        const ca = docs.filter(d=>d.type==='facture').reduce((s,d)=>s+docTotal(d),0);
        return `<div class="client-card" data-edit="${c.id}">
            <h3>${esc(c.name)}</h3>
            ${c.contact?`<p>${esc(c.contact)}</p>`:''}
            ${c.email?`<p>${esc(c.email)}</p>`:''}
            ${c.phone?`<p>${esc(c.phone)}</p>`:''}
            <div class="cc-stats"><span><b>${docs.filter(d=>d.type==='devis').length}</b> devis</span><span><b>${euro(ca)}</b> facturé</span></div>
        </div>`;
    }).join('');
    $$('.client-card', grid).forEach(card=> card.onclick=()=> editClient(card.dataset.edit));
}

let editingClient = null;
function newClient(returnToDoc=false){
    editingClient = {id:null, name:'', address:'', siret:'', contact:'', email:'', phone:''};
    editingClient._returnToDoc = returnToDoc;
    fillClientForm(); openModal('#clientModal');
}
function editClient(id){
    editingClient = structuredClone(DB.clients.find(c=>c.id===id));
    fillClientForm(); openModal('#clientModal');
}
function fillClientForm(){
    $('#clientModalTitle').textContent = editingClient.id ? 'Modifier le client' : 'Nouveau client';
    $('#cl-name').value=editingClient.name; $('#cl-address').value=editingClient.address;
    $('#cl-siret').value=editingClient.siret; $('#cl-contact').value=editingClient.contact;
    $('#cl-email').value=editingClient.email; $('#cl-phone').value=editingClient.phone;
    $('#deleteClient').hidden = !editingClient.id;
    updateSendDemandeBtn();
}
/* Active le bouton d'envoi seulement si un email est présent */
function updateSendDemandeBtn(){
    const btn = $('#sendDemandeForm'); if(!btn) return;
    const has = !!$('#cl-email').value.trim();
    btn.disabled = !has;
    btn.title = has ? '' : "Ajoutez un email pour activer l'envoi";
}
/* Construit le lien du formulaire pré-rempli (?societe=&contact=&email=) */
function buildDemandeFormLink(name, contact, email){
    const base = (DB.settings.demandeFormUrl||'').trim() || 'https://eric8740-stack.github.io/erp-conseil-app/demande.html';
    const qs = [];
    if(name)    qs.push('societe=' + encodeURIComponent(name));
    if(contact) qs.push('contact=' + encodeURIComponent(contact));
    if(email)   qs.push('email='   + encodeURIComponent(email));
    return base + (qs.length ? ((base.includes('?')?'&':'?') + qs.join('&')) : '');
}

/* Ouvre la messagerie (Outlook…) avec un email pré-rempli + lien du formulaire pré-rempli */
function openDemandeMail(name, contact, email){
    const link  = buildDemandeFormLink(name, contact, email);
    const owner = DB.settings.owner || '';
    const phone = DB.settings.phone || '';
    const greet = contact || name || 'Madame, Monsieur';
    const subject = "ERP Conseil — Votre demande d'intervention";
    const body = [
        'Bonjour ' + greet + ',',
        '',
        "Merci de l'intérêt porté à ERP Conseil.",
        '',
        "Pour cadrer votre besoin et vous proposer un devis adapté, pourriez-vous remplir cette courte fiche (2 minutes, pas besoin d'être technique) ; vos coordonnées y sont déjà pré-remplies :",
        link,
        '',
        'Je reviens vers vous très rapidement.',
        '',
        'Bien cordialement,',
        owner,
        'ERP Conseil — ' + phone
    ].join('\r\n');   // \r\n → %0D%0A après encodage

    window.location.href = 'mailto:' + email
        + '?subject=' + encodeURIComponent(subject)
        + '&body='    + encodeURIComponent(body);
}

/* Bouton de la fiche client (le client existe déjà) */
function sendDemandeFormEmail(){
    const email = $('#cl-email').value.trim();
    if(!email){ toast("Ajoutez un email pour activer l'envoi.", 'err'); return; }
    openDemandeMail($('#cl-name').value.trim(), $('#cl-contact').value.trim(), email);
}

/* Envoi à un prospect non encore client (onglet Demandes) — ne crée aucune fiche */
function openSendFormModal(){
    $('#sf-email').value=''; $('#sf-societe').value=''; $('#sf-contact').value='';
    openModal('#sendFormModal');
    setTimeout(()=>$('#sf-email').focus(), 50);
}
function sendFormFromModal(){
    const email = $('#sf-email').value.trim();
    if(!email){ toast('Indiquez une adresse email.', 'err'); return; }
    closeModal('#sendFormModal');
    openDemandeMail($('#sf-societe').value.trim(), $('#sf-contact').value.trim(), email);
}
function copyFormLinkFromModal(){
    copyToClipboard(buildDemandeFormLink($('#sf-societe').value.trim(), $('#sf-contact').value.trim(), $('#sf-email').value.trim()));
}
function saveClient(){
    const name = $('#cl-name').value.trim();
    if(!name){ toast('Le nom est obligatoire.', 'err'); return; }
    Object.assign(editingClient,{
        name, address:$('#cl-address').value.trim(), siret:$('#cl-siret').value.trim(),
        contact:$('#cl-contact').value.trim(), email:$('#cl-email').value.trim(), phone:$('#cl-phone').value.trim()
    });
    let id = editingClient.id;
    if(id){ const i=DB.clients.findIndex(c=>c.id===id); DB.clients[i]={...editingClient}; }
    else { id = editingClient.id = uid('cl'); DB.clients.push({...editingClient}); }
    save(); closeModal('#clientModal'); toast('Client enregistré', 'ok');

    if(editingClient._returnToDoc){            // revenu depuis l'éditeur de doc
        editing.clientId = id;
        fillClientSelect($('#doc-client'), id);
    } else { renderClients(); }
}
function deleteClient(){
    if(!editingClient.id) return;
    const used = DB.documents.some(d=>d.clientId===editingClient.id);
    if(used){ toast('Client utilisé par des documents : suppression impossible.', 'err'); return; }
    if(!confirm('Supprimer ce client ?')) return;
    DB.clients = DB.clients.filter(c=>c.id!==editingClient.id);
    save(); closeModal('#clientModal'); toast('Client supprimé'); renderClients();
}

/* ============================================================
   RÉGLAGES
   ============================================================ */
function fillSettings(){
    const s = DB.settings;
    $('#set-name').value=s.name; $('#set-owner').value=s.owner; $('#set-address').value=s.address;
    $('#set-siret').value=s.siret; $('#set-email').value=s.email; $('#set-phone').value=s.phone;
    $('#set-iban').value=s.iban||''; $('#set-paydays').value=s.paydays??30;
    $('#set-tva').value=s.tva; $('#set-payterms').value=s.payterms;
    $('#set-legal').value=s.legal; $('#set-validity').value=s.validity;
    $('#set-devprefix').value=s.devprefix; $('#set-facprefix').value=s.facprefix;
    $('#set-formurl').value=s.formurl||''; $('#set-satendpoint').value=s.satendpoint||'';
    $('#set-demformurl').value=s.demandeFormUrl||'';
    renderLogoPreview(); updateNumPreview();
}
function renderLogoPreview(){
    const box = $('#logoPreview');
    if(DB.settings.logo){
        box.innerHTML = `<img src="${DB.settings.logo}" alt="logo">`;
        $('#logoRemove').hidden = false;
    }else{
        box.innerHTML = `<span class="muted small">Aucun logo</span>`;
        $('#logoRemove').hidden = true;
    }
}
function setLogo(file){
    if(file.size > 1024*1024){ toast('Image trop lourde (max 1 Mo).', 'err'); return; }
    const r = new FileReader();
    r.onload = ()=>{ DB.settings.logo = r.result; save(); renderLogoPreview(); toast('Logo enregistré', 'ok'); };
    r.readAsDataURL(file);
}
function removeLogo(){ DB.settings.logo=''; save(); renderLogoPreview(); toast('Logo retiré'); }
function updateNumPreview(){
    const y=new Date().getFullYear();
    $('#numPreview').textContent = `${$('#set-devprefix').value||'DEV'}-${y}-001  ·  ${$('#set-facprefix').value||'FAC'}-${y}-001`;
}
function saveSettings(){
    const s = DB.settings;
    s.name=$('#set-name').value; s.owner=$('#set-owner').value; s.address=$('#set-address').value;
    s.siret=$('#set-siret').value; s.email=$('#set-email').value; s.phone=$('#set-phone').value;
    s.iban=$('#set-iban').value; s.paydays=Math.max(0,parseInt($('#set-paydays').value)||0);
    s.tva=$('#set-tva').value; s.payterms=$('#set-payterms').value;
    s.legal=$('#set-legal').value; s.validity=$('#set-validity').value;
    s.devprefix=$('#set-devprefix').value.trim()||'DEV'; s.facprefix=$('#set-facprefix').value.trim()||'FAC';
    s.formurl=$('#set-formurl').value.trim(); s.satendpoint=$('#set-satendpoint').value.trim();
    s.demandeFormUrl=$('#set-demformurl').value.trim();
    satCache=null; demCache=null;   // l'endpoint a pu changer : on rechargera avis & demandes
    save(); refreshBrand(); toast('Réglages enregistrés', 'ok');
}
function refreshBrand(){
    $('#sideCompany').textContent = DB.settings.name;
    $('#sideOwner').textContent   = DB.settings.owner;
}

/* ---------- Export / Import / Reset ---------- */
function exportData(){
    const blob = new Blob([JSON.stringify(DB,null,2)],{type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `erp-conseil-sauvegarde-${todayISO()}.json`;
    a.click(); URL.revokeObjectURL(a.href);
    toast('Sauvegarde exportée', 'ok');
}
function importData(file){
    const r = new FileReader();
    r.onload = () => {
        try{
            const data = JSON.parse(r.result);
            if(!data.settings || !Array.isArray(data.documents)) throw 0;
            if(!confirm('Remplacer toutes les données actuelles par cette sauvegarde ?')) return;
            DB = data;
            DB.settings = Object.assign({}, DEFAULTS.settings, DB.settings);
            DB.settings.counters = DB.settings.counters||{};
            save(); refreshBrand(); showView('dashboard'); toast('Sauvegarde importée', 'ok');
        }catch(e){ toast('Fichier invalide.', 'err'); }
    };
    r.readAsText(file);
}
function resetData(){
    if(!confirm('Tout réinitialiser ? Cette action est irréversible (pensez à exporter une sauvegarde avant).')) return;
    DB = structuredClone(DEFAULTS); save(); refreshBrand(); showView('dashboard'); toast('Données réinitialisées');
}

/* ============================================================
   MODALES
   ============================================================ */
function openModal(sel){ $(sel).classList.add('open'); }
function closeModal(sel){ $(sel).classList.remove('open'); }

/* ============================================================
   ÉVÉNEMENTS
   ============================================================ */
function bindNewButtons(){
    $$('[data-new]').forEach(b=> b.onclick = ()=> newDoc(b.dataset.new==='facture'?'facture':'devis'));
}
function init(){
    load(); refreshBrand();

    // navigation
    $$('.nav-item').forEach(b=> b.onclick = ()=> showView(b.dataset.view));
    $$('[data-view-link]').forEach(b=> b.onclick = ()=> showView(b.dataset.viewLink));
    $('#burger').onclick = ()=> $('#sidebar').classList.toggle('open');

    // boutons « nouveau »
    bindNewButtons();
    $('#newClientBtn').onclick = ()=> newClient(false);

    // recherches
    $('#devisSearch').oninput    = ()=> renderDocList('devis');
    $('#facturesSearch').oninput = ()=> renderDocList('facture');
    $('#clientsSearch').oninput  = ()=> renderClients();

    // éditeur doc
    $('#addLine').onclick   = ()=>{ editing.lines.push({designation:'',qty:1,unit:'forfait',pu:0}); renderLines(); };
    $('#saveDoc').onclick   = saveDoc;
    $('#deleteDoc').onclick = deleteDoc;
    $('#printDoc').onclick  = printDoc;
    $('#convertDoc').onclick= convertToFacture;
    $('#reviewLinkDoc').onclick = ()=> openReviewModal(editing.clientId, editing.number||'');
    $('#doc-client').onchange = e=>{ if(e.target.value==='__new'){ newClient(true);} else { editing.clientId=e.target.value; } };
    $('#doc-status').onchange = updatePaidVisibility;

    // éditeur client
    $('#saveClient').onclick   = saveClient;
    $('#deleteClient').onclick = deleteClient;
    $('#sendDemandeForm').onclick = sendDemandeFormEmail;
    $('#cl-email').oninput = updateSendDemandeBtn;

    // réglages
    $('#saveSettings').onclick = saveSettings;
    $('#set-devprefix').oninput = updateNumPreview;
    $('#set-facprefix').oninput = updateNumPreview;
    $('#logoBtn').onclick = ()=> $('#logoFile').click();
    $('#logoFile').onchange = e=>{ if(e.target.files[0]) setLogo(e.target.files[0]); e.target.value=''; };
    $('#logoRemove').onclick = removeLogo;

    // demandes d'intervention
    $('#demSendForm').onclick = openSendFormModal;
    $('#sf-send').onclick      = sendFormFromModal;
    $('#sf-copy').onclick      = copyFormLinkFromModal;
    $('#demRefresh').onclick  = ()=> renderDemandes(true);
    $('#demFormLink').onclick = ()=>{ const v=(DB.settings.demandeFormUrl||'').trim();
        if(!v){ toast("Renseignez le lien du formulaire dans Réglages.", 'err'); showView('settings'); return; }
        copyToClipboard(v); };
    $('#demConvert').onclick  = ()=> convertDemandeToDevis(currentDemande);

    // satisfaction
    $('#satRefresh').onclick  = ()=> renderSatisfaction(true);
    $('#satNewLink').onclick  = ()=> openReviewModal(DB.clients[0]?.id, '');
    $('#rv-client').onchange  = updateReviewUrl;
    $('#rv-mission').oninput  = updateReviewUrl;
    $('#rv-copy').onclick     = copyReviewLink;
    $('#rv-open').onclick     = ()=>{ const v=$('#rv-url').value; if(v) window.open(v,'_blank'); };

    // bilan
    $('#bilanYear').onchange = renderBilan;
    $('#exportCsv').onclick  = exportCsv;
    $('#exportData').onclick = exportData;
    $('#importData').onclick = ()=> $('#importFile').click();
    $('#importFile').onchange = e=>{ if(e.target.files[0]) importData(e.target.files[0]); e.target.value=''; };
    $('#resetData').onclick = resetData;

    // fermeture modales (ferme la modale parente du bouton, quelle qu'elle soit)
    $$('[data-close]').forEach(b=> b.onclick = ()=> b.closest('.modal-overlay').classList.remove('open'));
    $$('.modal-overlay').forEach(o=> o.onclick = e=>{ if(e.target===o) o.classList.remove('open'); });
    document.addEventListener('keydown', e=>{ if(e.key==='Escape') $$('.modal-overlay').forEach(o=>o.classList.remove('open')); });

    showView('dashboard');
}
document.addEventListener('DOMContentLoaded', init);
})();

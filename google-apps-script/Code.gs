/**
 * ============================================================
 *  ERP Conseil — Relais Apps Script → Airtable (v2)
 * ============================================================
 *
 *  Un seul script gère DEUX tables de la base Airtable :
 *   - "Satisfaction" : avis clients   (formulaire satisfaction.html)
 *   - "Demandes"     : demandes d'intervention (formulaire demande.html)
 *
 *  Le routage se fait par le champ JSON `type` :
 *   - doPost : si type==='demande' → écrit dans "Demandes", sinon "Satisfaction"
 *   - doGet  : si ?type=demande    → lit "Demandes",      sinon "Satisfaction"
 *
 *  La clé Airtable n'est JAMAIS dans le code public : elle est stockée côté
 *  Google dans une propriété de script (AIRTABLE_TOKEN).
 *
 *  ------------------------------------------------------------
 *  INSTALLATION / MISE À JOUR
 *  ------------------------------------------------------------
 *  1) JETON AIRTABLE — https://airtable.com/create/tokens
 *     Scopes : data.records:read, data.records:write
 *     ET (pour créer la table Demandes via setupDemandes) : schema.bases:write
 *     Accès à la base « ERP Conseil » (appxtRiMOwwHlRk1k). Jeton « pat… ».
 *     (Si vous ne voulez pas le scope schema.bases:write, créez la table
 *      "Demandes" à la main dans Airtable avec les champs listés plus bas,
 *      puis ignorez setupDemandes.)
 *  2) Collez TOUT ce fichier dans le projet Apps Script (remplace l'ancien).
 *  3) ⚙ Paramètres du projet → Propriétés du script :
 *     nom = AIRTABLE_TOKEN, valeur = votre jeton « pat… ».
 *  4) Lancez UNE FOIS la fonction setupDemandes (menu Exécuter → setupDemandes,
 *     autorisez l'accès) pour créer la table "Demandes".
 *  5) Déployer → Gérer les déploiements → modifier → « Nouvelle version »
 *     (accès « Tout le monde »). L'URL /exec ne change pas.
 *  ------------------------------------------------------------
 */

const BASE_ID   = 'appxtRiMOwwHlRk1k';
const T_SATISF   = 'Satisfaction';
const T_DEMANDE = 'Demandes';

/* ============================================================
   ÉCRITURE (doPost)
   ============================================================ */
function doPost(e){
  try{
    const d = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    if(d.type === 'demande'){
      const fields = {
        'Société':              d.societe     || '',
        'Contact':              d.contact     || '',
        'Email':                d.email       || '',
        'Téléphone':            d.telephone   || '',
        'Description du besoin': d.description || '',
        'Outils utilisés':      d.outils      || '',
        'Adresse du site':      d.adresse     || '',
        'Contact sur place':    d.contactsite || '',
        'Budget indicatif':     d.budget      || '',
        'Date':                 d.date || new Date().toISOString().slice(0, 10),
        'Statut':               'Nouvelle'
      };
      // Champs select / multi-select : seulement s'ils sont renseignés
      if(Array.isArray(d.besoins) && d.besoins.length) fields['Type de besoin']     = d.besoins;
      if(d.mode)  fields["Mode d'intervention"] = d.mode;
      if(d.delai) fields['Délai souhaité']      = d.delai;

      const res = airtableFetch_('POST', T_DEMANDE, '', { records: [{ fields: fields }], typecast: true });
      const id  = res.records && res.records[0] ? res.records[0].id : null;
      return jsonOut_({ ok: true, id: id });
    }

    // --- Satisfaction (comportement inchangé) ---
    const fields = {
      'Client':              d.client        || '',
      'Mission':             d.mission       || '',
      'Note globale':        Number(d.note)  || 0,
      'Recommandation':      d.recommandation|| '',
      'Commentaire':         d.commentaire   || '',
      'Email':               d.email         || '',
      'Date':                new Date().toISOString().slice(0, 10),
      'Publier sur le site': d.publier === true || d.publier === 'true'
    };
    const res = airtableFetch_('POST', T_SATISF, '', { records: [{ fields: fields }], typecast: true });
    const id  = res.records && res.records[0] ? res.records[0].id : null;
    return jsonOut_({ ok: true, id: id });

  }catch(err){
    return jsonOut_({ ok: false, error: String(err) });
  }
}

/* ============================================================
   LECTURE (doGet) — tri par Date desc, pagination
   ============================================================ */
function doGet(e){
  try{
    const table = (e && e.parameter && e.parameter.type === 'demande') ? T_DEMANDE : T_SATISF;
    let records = [];
    let offset  = null;
    do{
      let suffix = '?pageSize=100&sort%5B0%5D%5Bfield%5D=Date&sort%5B0%5D%5Bdirection%5D=desc';
      if(offset) suffix += '&offset=' + encodeURIComponent(offset);
      const res = airtableFetch_('GET', table, suffix, null);
      records = records.concat(res.records || []);
      offset  = res.offset || null;
    } while(offset);

    return jsonOut_({ ok: true, records: records.map(function(r){ return r.fields; }) });
  }catch(err){
    return jsonOut_({ ok: false, error: String(err), records: [] });
  }
}

/* ============================================================
   CRÉATION DE LA TABLE "Demandes" (à lancer UNE fois)
   ============================================================ */
function setupDemandes(){
  const token = PropertiesService.getScriptProperties().getProperty('AIRTABLE_TOKEN');
  if(!token) throw 'Propriété AIRTABLE_TOKEN absente.';

  const payload = {
    name: T_DEMANDE,
    description: "Demandes d'intervention reçues via le formulaire public",
    fields: [
      { name: 'Société',  type: 'singleLineText' },   // 1er = champ primaire
      { name: 'Contact',  type: 'singleLineText' },
      { name: 'Email',    type: 'email' },
      { name: 'Téléphone', type: 'singleLineText' },
      { name: 'Type de besoin', type: 'multipleSelects', options: { choices: [
        { name: 'Tableau de bord Power BI' },
        { name: 'Automatisation Excel / VBA' },
        { name: "Correction d'un fichier existant" },
        { name: 'Extraction / analyse de données (SQL)' },
        { name: 'Formation' },
        { name: 'Je ne sais pas trop' }
      ] } },
      { name: 'Description du besoin', type: 'multilineText' },
      { name: 'Outils utilisés', type: 'singleLineText' },
      { name: "Mode d'intervention", type: 'singleSelect', options: { choices: [
        { name: 'Sur site' }, { name: 'À distance' }, { name: 'Peu importe' }
      ] } },
      { name: 'Adresse du site', type: 'singleLineText' },
      { name: 'Contact sur place', type: 'singleLineText' },
      { name: 'Délai souhaité', type: 'singleSelect', options: { choices: [
        { name: 'Urgent' }, { name: 'Sous 2 semaines' }, { name: 'Ce mois-ci' }, { name: 'Pas pressé' }
      ] } },
      { name: 'Budget indicatif', type: 'singleLineText' },
      { name: 'Date', type: 'date', options: { dateFormat: { name: 'european' } } },
      { name: 'Statut', type: 'singleSelect', options: { choices: [
        { name: 'Nouvelle' }, { name: 'Traitée' }, { name: 'Devis envoyé' }
      ] } }
    ]
  };

  const url  = 'https://api.airtable.com/v0/meta/bases/' + BASE_ID + '/tables';
  const resp = UrlFetchApp.fetch(url, {
    method: 'POST',
    contentType: 'application/json',
    headers: { 'Authorization': 'Bearer ' + token },
    muteHttpExceptions: true,
    payload: JSON.stringify(payload)
  });
  Logger.log('setupDemandes → HTTP ' + resp.getResponseCode());
  Logger.log(resp.getContentText());
  if(resp.getResponseCode() >= 300){
    throw 'Échec création table : ' + resp.getContentText() +
          ' (le jeton a-t-il le scope schema.bases:write ?)';
  }
  return 'Table "Demandes" créée.';
}

/* ============================================================
   Helpers
   ============================================================ */
function airtableFetch_(method, table, suffix, payload){
  const token = PropertiesService.getScriptProperties().getProperty('AIRTABLE_TOKEN');
  if(!token) throw 'Propriété AIRTABLE_TOKEN absente (voir installation).';

  const url  = 'https://api.airtable.com/v0/' + BASE_ID + '/' +
               encodeURIComponent(table) + (suffix || '');
  const opts = {
    method: method,
    headers: { 'Authorization': 'Bearer ' + token },
    muteHttpExceptions: true
  };
  if(payload){
    opts.contentType = 'application/json';
    opts.payload     = JSON.stringify(payload);
  }

  const resp = UrlFetchApp.fetch(url, opts);
  const text = resp.getContentText();
  const data = text ? JSON.parse(text) : {};
  if(resp.getResponseCode() >= 300){
    throw (data.error && data.error.message) ? data.error.message : text;
  }
  return data;
}

function jsonOut_(obj){
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * ============================================================
 *  ERP Conseil — Relais Satisfaction (Google Apps Script → Airtable)
 * ============================================================
 *
 *  Ce script sert d'intermédiaire sécurisé entre :
 *   - le formulaire public  satisfaction.html   (écrit un avis  → doPost)
 *   - l'onglet « Satisfaction » de l'application (lit les avis   → doGet)
 *
 *  La clé Airtable n'est JAMAIS exposée dans le code public : elle est
 *  stockée côté Google dans une propriété de script (AIRTABLE_TOKEN).
 *
 *  ------------------------------------------------------------
 *  INSTALLATION — 4 ÉTAPES
 *  ------------------------------------------------------------
 *  1) JETON AIRTABLE
 *     - Allez sur https://airtable.com/create/tokens
 *     - Créez un « personal access token » avec les scopes
 *       data.records:read ET data.records:write
 *     - Donnez-lui accès à la base « ERP Conseil » (appxtRiMOwwHlRk1k)
 *     - Copiez le jeton (commence par « pat… »)
 *
 *  2) LE SCRIPT
 *     - Allez sur https://script.google.com → Nouveau projet
 *     - Collez tout ce fichier dans l'éditeur (remplacez le contenu par défaut)
 *
 *  3) LA PROPRIÉTÉ AIRTABLE_TOKEN
 *     - Menu ⚙ « Paramètres du projet » → « Propriétés du script »
 *     - Ajoutez une propriété : nom = AIRTABLE_TOKEN, valeur = votre jeton « pat… »
 *     - Enregistrez
 *
 *  4) DÉPLOIEMENT EN APPLICATION WEB
 *     - Bouton « Déployer » → « Nouveau déploiement » → type « Application Web »
 *     - Exécuter en tant que : Moi
 *     - Qui a accès : « Tout le monde »
 *     - Déployer, autoriser l'accès, puis COPIEZ l'URL qui se termine par /exec
 *     - Collez cette URL dans l'application (Réglages → Satisfaction client →
 *       « Endpoint de lecture des avis ») ET dans satisfaction.html (constante
 *       ENDPOINT).
 *  ------------------------------------------------------------
 */

const AIRTABLE_BASE  = 'appxtRiMOwwHlRk1k';   // base « ERP Conseil » (déjà créée)
const AIRTABLE_TABLE = 'Satisfaction';        // table cible

/**
 * Écriture d'un avis (appelé par satisfaction.html).
 * Corps attendu (JSON) : { client, mission, note, recommandation, commentaire, email, publier }
 */
function doPost(e){
  try{
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const fields = {
      'Client':              body.client        || '',
      'Mission':             body.mission       || '',
      'Note globale':        Number(body.note)  || 0,
      'Recommandation':      body.recommandation|| '',
      'Commentaire':         body.commentaire   || '',
      'Email':               body.email         || '',
      'Date':                new Date().toISOString().slice(0, 10),
      'Publier sur le site': body.publier === true || body.publier === 'true'
    };
    const res = airtableFetch_('POST', '', { records: [{ fields: fields }], typecast: true });
    const id  = res.records && res.records[0] ? res.records[0].id : null;
    return jsonOut_({ ok: true, id: id });
  }catch(err){
    return jsonOut_({ ok: false, error: String(err) });
  }
}

/**
 * Lecture de tous les avis, triés par Date décroissante (appelé par l'application).
 * Renvoie : { ok:true, records:[ {Client, Mission, "Note globale", ...}, ... ] }
 */
function doGet(){
  try{
    let records = [];
    let offset  = null;
    do{
      let suffix = '?pageSize=100&sort%5B0%5D%5Bfield%5D=Date&sort%5B0%5D%5Bdirection%5D=desc';
      if(offset) suffix += '&offset=' + encodeURIComponent(offset);
      const res = airtableFetch_('GET', suffix, null);
      records = records.concat(res.records || []);
      offset  = res.offset || null;
    } while(offset);

    return jsonOut_({ ok: true, records: records.map(function(r){ return r.fields; }) });
  }catch(err){
    return jsonOut_({ ok: false, error: String(err), records: [] });
  }
}

/* ---------- Appel générique à l'API Airtable ---------- */
function airtableFetch_(method, suffix, payload){
  const token = PropertiesService.getScriptProperties().getProperty('AIRTABLE_TOKEN');
  if(!token) throw 'Propriété AIRTABLE_TOKEN absente (voir étape 3 de l\'installation).';

  const url  = 'https://api.airtable.com/v0/' + AIRTABLE_BASE + '/' +
               encodeURIComponent(AIRTABLE_TABLE) + (suffix || '');
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

/* ---------- Réponse JSON ---------- */
function jsonOut_(obj){
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

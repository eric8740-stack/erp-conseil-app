/* Banc d'essai du verrou doPost — charge le VRAI google-apps-script/Code.gs et
   remplace seulement ce qui touche Google et Airtable. Aucune requête réseau,
   aucune écriture dans la base : ce qu'on mesure, c'est le branchement.

   node google-apps-script/test_verrou_dopost.js
*/
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, 'Code.gs');
const CLE = 'CLE-ECRITURE-DE-TEST-2026';

function monter(writeKeyPresente) {
  const appels = [];
  const ctx = {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (n) => {
          if (n === 'WRITE_KEY') return writeKeyPresente ? CLE : null;
          if (n === 'READ_KEY') return 'CLE-LECTURE';
          if (n === 'AIRTABLE_TOKEN') return 'patFACTICE';
          return null;
        }
      })
    },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (s) => ({ setMimeType: () => ({ _corps: s }) })
    },
    UrlFetchApp: { fetch: () => { throw new Error('aucun appel reseau ne doit sortir'); } },
    console
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(SRC, 'utf8'), ctx);
  // on neutralise l'acces Airtable APRES chargement, pour tracer les appels
  ctx.airtableFetch_ = (methode, table, suffixe, corps) => {
    appels.push(methode + ' ' + table);
    return { records: [{ id: 'recSIMULE' }] };
  };
  return { ctx, appels };
}

function jouer(titre, writeKeyPresente, charge, attendu) {
  const { ctx, appels } = monter(writeKeyPresente);
  const out = ctx.doPost({ postData: { contents: JSON.stringify(charge) } });
  const rep = JSON.parse(out._corps);
  const ok = rep.ok === attendu.ok && (attendu.error === undefined || rep.error === attendu.error)
             && JSON.stringify(appels) === JSON.stringify(attendu.appels);
  console.log((ok ? '  OK  ' : ' ECHEC') + ' | ' + titre);
  console.log('        reponse  : ' + JSON.stringify(rep));
  console.log('        Airtable : ' + (appels.length ? appels.join(', ') : 'aucun appel'));
  console.log('        attendu  : ok=' + attendu.ok
              + (attendu.error ? ", error='" + attendu.error + "'" : '')
              + ', Airtable=' + (attendu.appels.length ? attendu.appels.join(', ') : 'aucun appel'));
  console.log('');
  return ok;
}

console.log("\n=== Verrou d'ecriture doPost — WRITE_KEY ===\n");
const r = [];

r.push(jouer(
  "1. demande-statut SANS cle           -> doit etre REFUSE",
  true, { type: 'demande-statut', id: 'recX', statut: 'Traitée' },
  { ok: false, error: 'unauthorized', appels: [] }));

r.push(jouer(
  "2. demande-statut AVEC la bonne cle  -> doit PASSER",
  true, { type: 'demande-statut', id: 'recX', statut: 'Traitée', key: CLE },
  { ok: true, appels: ['PATCH Demandes'] }));

r.push(jouer(
  "3. insertion 'demande' SANS cle      -> doit TOUJOURS PASSER (formulaire public)",
  true, { type: 'demande', societe: 'Societe de test', description: 'Besoin de test' },
  { ok: true, appels: ['POST Demandes'] }));

console.log('--- controles complementaires ---\n');

r.push(jouer(
  "4. insertion 'satisfaction' SANS cle -> doit TOUJOURS PASSER (formulaire public)",
  true, { client: 'Client de test', note: 5 },
  { ok: true, appels: ['POST Satisfaction'] }));

r.push(jouer(
  "5. demande-statut, mauvaise cle      -> doit etre REFUSE",
  true, { type: 'demande-statut', id: 'recX', statut: 'Traitée', key: 'mauvaise' },
  { ok: false, error: 'unauthorized', appels: [] }));

r.push(jouer(
  "6. propriete WRITE_KEY ABSENTE       -> doit etre REFUSE meme avec une cle (fail-closed)",
  false, { type: 'demande-statut', id: 'recX', statut: 'Traitée', key: CLE },
  { ok: false, error: 'unauthorized', appels: [] }));

const total = r.length, reussis = r.filter(Boolean).length;
console.log('=== ' + reussis + '/' + total + ' cas conformes ===');
process.exit(reussis === total ? 0 : 1);

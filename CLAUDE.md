# Espace Pro ERP Conseil — repères pour Claude Code

Application de gestion commerciale 100 % statique (GitHub Pages) : devis & factures
(PDF, art. 293 B, numérotation auto), paiements & relances, bilan annuel, module
URSSAF, demandes d'intervention et satisfaction client (formulaires publics →
relais Apps Script → Airtable → tableau de bord, lecture par clé). Données :
localStorage + Airtable. Pas de serveur, pas de build : HTML/CSS/JS vanilla.

## Capsule contexte — pour les sessions sans la config globale

Mainteneur : **Eric Paysant** (ERP Conseil). Profil et règles complets dans le dépôt
privé `eric8740-stack/claude-config` (chargé d'office dans les sessions locales sur
les PC d'Eric ; cette capsule est le minimum vital pour les autres sessions).

- Préférences : réponses directes ; trancher les détails techniques sans multiplier
  les questions ; conventional commits ; on teste APRÈS push (GitHub Pages).
- Fin de session : tout committer et **pousser sur `main`** — deux PC se synchronisent
  par `git pull`, et l'un part en rendez-vous client.
- Gros chantier : proposer un découpage en 2 sessions Claude Code parallèles.
- ⚠️ Dépôt **PUBLIC** : jamais de données client réelles, de coordonnées personnelles,
  de clés/secrets (les clés Airtable restent dans les Réglages de l'app,
  jamais dans le code) ni de captures avec de vraies données.
  ⚠️ Cela vaut aussi pour `DEFAULTS` dans `js/app.js` : ces valeurs sont servies
  telles quelles à tout visiteur dont le `localStorage` est vide. Elles doivent
  rester neutres — constat du 26/08/2026 : adresse, téléphone, SIREN, dates
  URSSAF/ACRE et un nom de client réel y étaient exposés depuis 47 à 71 jours.
- **Deux clés, deux rôles** côté Apps Script : `READ_KEY` protège les lectures,
  `WRITE_KEY` les écritures d'administration (`demande-statut`). Les insertions
  des formulaires publics (`demande`, `satisfaction`) restent ouvertes, sans clé —
  un prospect n'a pas de clé. Recette : `node google-apps-script/test_verrou_dopost.js`.

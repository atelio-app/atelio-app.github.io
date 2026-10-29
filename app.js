// =====================================================================
// ATELIO : application web (prototype)
// Ces deux valeurs sont publiques : elles identifient ton projet Supabase.
// La sécurité vient des règles de droits (RLS) de la base, pas de ces clés.
// =====================================================================
const SUPABASE_URL = 'https://rguaunwxgdkbeqwdrfde.supabase.co';
const SUPABASE_KEY = 'sb_publishable_cMZnWaWrp8uvlTD2Gxk6HQ_2rCmCw1w';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const app = document.getElementById('app');

const MDP_MIN = 5;
const ROLES = { super_admin: 'Éditeur', admin_esat: 'Administrateur ESAT', moniteur: 'Moniteur' };
const COULEURS = [
  { hex: '#B3261E', nom: 'Rouge brique' }, { hex: '#8C1D40', nom: 'Bordeaux' }, { hex: '#A3295C', nom: 'Framboise' },
  { hex: '#B0306E', nom: 'Rose' }, { hex: '#9C2A8F', nom: 'Magenta' }, { hex: '#6B3FA0', nom: 'Violet' },
  { hex: '#4B4FA3', nom: 'Indigo' }, { hex: '#2F55B5', nom: 'Bleu roi' }, { hex: '#1F6F94', nom: 'Turquoise' },
  { hex: '#0F766E', nom: 'Sarcelle' }, { hex: '#006064', nom: 'Pétrole' }, { hex: '#1B5E3B', nom: 'Vert sapin' },
  { hex: '#5F6B1F', nom: 'Vert olive' }, { hex: '#7A6100', nom: 'Moutarde' }, { hex: '#8A5A00', nom: 'Ocre' },
  { hex: '#7A4A2A', nom: 'Brun' }, { hex: '#42526B', nom: 'Ardoise' }, { hex: '#4A4A4A', nom: 'Anthracite' }
];

// Contraste d'une couleur avec du texte blanc (il faut au moins 4,5 pour rester lisible).
function contrasteBlanc(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 1.05 / (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] + 0.05);
}

const S = { user: null, profil: null, m: null, a: null, prefs: { prenom: '', rappels: [] } };

// ---------------------------------------------------------------------
// Petits outils
// ---------------------------------------------------------------------

// Crée un élément de page : h('div', { class: 'card' }, 'texte', autreElement)
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

function render(node) {
  const y = window.scrollY;
  app.replaceChildren(node);
  window.scrollTo(0, y);
}

function couleurSure(c) {
  return /^#[0-9A-Fa-f]{6}$/.test(c || '') ? c : '#42526B';
}

function aujourdhuiISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function dateDepuisISO(iso) { return new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)); }
function decalerJour(iso, n) {
  const d = dateDepuisISO(iso); d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function dateLongue(iso) {
  const t = (iso ? dateDepuisISO(iso) : new Date()).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function champ(id, libelle, input) {
  return h('div', {}, h('label', { class: 'lbl', for: id }, libelle), input);
}

function pageAvec(contenu, large) {
  return h('div', {}, entete(), h('main', { class: 'page' + (large ? ' large' : '') }, contenu));
}

async function deconnexion() {
  await sb.auth.signOut();
  S.user = null; S.profil = null; S.m = null; S.a = null; S.t = null; S.c = null; S.accueil = null; S.prefs = { prenom: '', rappels: [] }; S.mdpFait = false; S.supEd = undefined; S.supMsg = null;
  vueConnexion();
}

function vueMessage(titre, texte) {
  render(pageAvec([h('div', { class: 'card stack' }, h('h1', {}, titre), h('p', { class: 'muted' }, texte))]));
}

// ---------------------------------------------------------------------
// ACCUEIL, MENU DU COMPTE ET RAPPELS (pour tous les rôles)
// ---------------------------------------------------------------------
const JOURS_RAPPEL = [[1, 'Lun'], [2, 'Mar'], [3, 'Mer'], [4, 'Jeu'], [5, 'Ven'], [6, 'Sam'], [0, 'Dim']];
const RAPPELS_MAX = 3;

function initiale() {
  const base = (S.prefs && S.prefs.prenom) || (S.user && S.user.email) || '?';
  return base.trim().charAt(0).toUpperCase();
}
function nomAffiche() { return (S.prefs && S.prefs.prenom) || (S.user ? S.user.email : ''); }

function fermerMenu(rendreFocus) {
  const m = document.getElementById('menu-compte');
  const b = document.getElementById('btn-compte');
  if (!m || m.hidden) return;
  m.hidden = true;
  if (b) { b.setAttribute('aria-expanded', 'false'); if (rendreFocus) b.focus(); }
}
document.addEventListener('click', (e) => { if (!e.target.closest || !e.target.closest('.avatar-wrap')) fermerMenu(false); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fermerMenu(true); });

function entete() {
  const p = S.profil;
  const aller = (f) => () => { fermerMenu(false); f(); };
  const menu = h('div', { class: 'menu', id: 'menu-compte', hidden: true, role: 'group', 'aria-label': 'Mon compte' },
    h('div', { class: 'menu-id' },
      h('strong', {}, nomAffiche()),
      S.user && S.prefs && S.prefs.prenom ? h('span', { class: 'muted' }, S.user.email) : null,
      p ? h('span', { class: 'tag', style: 'align-self:flex-start;margin-top:4px' }, ROLES[p.role]) : null),
    S.user ? h('button', { type: 'button', class: 'menu-item', onClick: aller(() => vueCompte()) }, 'Mon compte et mes rappels') : null,
    (S.user && p && p.role !== 'moniteur') ? h('button', { type: 'button', class: 'menu-item', onClick: aller(() => vueChangerMdp({ volontaire: true })) }, 'Mon mot de passe') : null,
    S.user ? h('button', { type: 'button', class: 'menu-item', onClick: aller(() => vueAide()) }, 'Aide et support') : null,
    h('button', { type: 'button', class: 'menu-item', onClick: deconnexion }, 'Se déconnecter'));
  const bouton = h('button', {
    type: 'button', id: 'btn-compte', class: 'avatar', 'aria-haspopup': 'true', 'aria-expanded': 'false',
    'aria-label': 'Mon compte : ' + nomAffiche(),
    onClick: () => { const ouvert = menu.hidden; menu.hidden = !ouvert; bouton.setAttribute('aria-expanded', String(ouvert)); }
  }, initiale());
  return h('header', { class: 'top' },
    h('div', { class: 'marques' },
      h('img', { class: 'logo', src: 'logo.png', alt: 'Atelio' }),
      S.marque && logoSur(S.marque.logo) ? h('img', { class: 'logo-esat', src: logoSur(S.marque.logo), alt: 'Logo ' + (S.marque.nom || 'de l’ESAT') }) : null),
    h('div', { class: 'avatar-wrap' }, bouton, menu));
}

// Navigation principale, différente selon le rôle
function navPrincipale(actif) {
  const role = S.profil && S.profil.role;
  const onglets = [['accueil', 'Accueil', () => chargerAccueil()]];
  if (role === 'moniteur') onglets.push(['saisie', 'Saisie du jour', () => chargerMoniteur()]);
  else if (role === 'super_admin') onglets.push(['editeur', 'Espace éditeur', () => chargerAdmin()]);
  else onglets.push(['tableau', 'Tableau de bord', () => chargerAdminEsat()], ['reporting', 'Reporting', () => chargerReporting()], ['planning', 'Planning', () => chargerPlanning()], ['journal', 'Journal', () => chargerJournal()], ['gestion', 'Gérer l’ESAT', () => chargerGestion()], ['statuts', 'Statuts et motifs', () => chargerStatutsEsat()], ['parametres', 'Paramètres', () => chargerParametres()]);
  return h('nav', { class: 'tabs', 'aria-label': 'Sections' }, onglets.map(([id, libelle, aller]) =>
    h('button', { type: 'button', class: 'tabbtn' + (actif === id ? ' on' : ''), 'aria-pressed': String(actif === id), onClick: aller }, libelle)));
}

// --- Préférences (prénom + rappels), propres à chaque personne
async function chargerPrefs() {
  S.prefs = { prenom: '', rappels: [] };
  try {
    const { data, error } = await sb.from('preferences').select('prenom, rappels').eq('user_id', S.user.id).maybeSingle();
    if (!error && data) S.prefs = { prenom: data.prenom || '', rappels: Array.isArray(data.rappels) ? data.rappels : [] };
  } catch (e) { /* l'accueil s'affiche quand même */ }
}

async function enregistrerPrefs(prenom, rappels) {
  const { error } = await sb.from('preferences').upsert(
    { user_id: S.user.id, prenom: prenom || null, rappels, maj: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) return { erreur: error.message };
  S.prefs = { prenom: prenom || '', rappels };
  return {};
}

function cleFait(r) { return 'atelio-fait-' + (S.user ? S.user.id : '') + '-' + aujourdhuiISO() + '-' + r.id; }
function lireFait(r) { try { return localStorage.getItem(cleFait(r)) === '1'; } catch (e) { return false; } }
function ecrireFait(r, v) { try { if (v) localStorage.setItem(cleFait(r), '1'); else localStorage.removeItem(cleFait(r)); } catch (e) { /* facultatif */ } }

// --- Accueil
async function chargerAccueil() {
  S.abs = null;
  render(h('main', { class: 'center' }, h('p', { class: 'muted' }, 'Chargement…')));
  const role = S.profil.role;
  const jour = aujourdhuiISO();
  const info = { role };
  try {
    if (role === 'moniteur') {
      const [tr, pr, va] = await Promise.all([
        sb.from('travailleurs').select('id').eq('actif', true),
        sb.from('presences').select('id, statut_id').eq('jour', jour),
        sb.from('journees_validees').select('atelier_id').eq('jour', jour)
      ]);
      if (!tr.error && !pr.error && !va.error) {
        const ids = new Set((tr.data || []).map((w) => w.id));
        info.total = ids.size;
        info.faits = (pr.data || []).length;
        info.valide = (va.data || []).length > 0;
      }
    } else if (role === 'admin_esat') {
      const prec = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
      const precDebut = premierDuMois(prec.getFullYear(), prec.getMonth());
      const precFin = isoJour(prec.getFullYear(), prec.getMonth(), nbJours(prec.getFullYear(), prec.getMonth()));
      const [at, tr, pr, va, clo, anc] = await Promise.all([
        sb.from('ateliers').select('id, nom').eq('esat_id', S.profil.esat_id).order('nom'),
        sb.from('travailleurs').select('id, atelier_id').eq('actif', true),
        sb.from('presences').select('travailleur_id').eq('jour', jour),
        sb.from('journees_validees').select('atelier_id').eq('jour', jour),
        sb.from('mois_clotures').select('mois').eq('mois', precDebut).maybeSingle(),
        sb.from('presences').select('id').gte('jour', precDebut).lte('jour', precFin).limit(1)
      ]);
      if (!clo.error && !anc.error && !clo.data && (anc.data || []).length > 0) {
        info.aCloturer = { annee: prec.getFullYear(), mois: prec.getMonth() };
      }
      if (!at.error && !tr.error && !pr.error && !va.error) {
        const saisis = new Set((pr.data || []).map((x) => x.travailleur_id));
        const valides = new Set((va.data || []).map((x) => x.atelier_id));
        info.ateliers = (at.data || []).map((a) => {
          const membres = (tr.data || []).filter((w) => w.atelier_id === a.id);
          return { nom: a.nom, total: membres.length, faits: membres.filter((w) => saisis.has(w.id)).length, valide: valides.has(a.id) };
        });
      }
    } else {
      const es = await sb.from('esats').select('id');
      if (!es.error) info.nbEsat = (es.data || []).length;
    }
  } catch (e) { /* on affiche l'accueil sans les chiffres */ }
  S.accueil = info;
  vueAccueil();
}

function blocAFaire(info) {
  const role = info.role;
  if (role === 'moniteur') {
    let texte;
    if (info.total === undefined) texte = 'Renseignez la présence de chaque personne de votre atelier, puis validez la journée.';
    else if (info.total === 0) texte = 'Aucun travailleur n’est encore dans votre atelier : la direction doit d’abord les ajouter.';
    else if (info.valide) texte = 'La journée est validée. Merci ! Vous pouvez encore la modifier si quelque chose a changé.';
    else texte = info.faits + ' personne' + (info.faits > 1 ? 's' : '') + ' sur ' + info.total + ' renseignée' + (info.faits > 1 ? 's' : '') + '. Renseignez la présence de chacun, puis validez la journée.';
    return h('section', { class: 'banner stack', 'aria-labelledby': 't-afaire', style: 'align-items:flex-start' },
      h('h2', { id: 't-afaire' }, 'À faire aujourd’hui'),
      h('p', { style: 'font-weight:430' }, texte),
      h('button', { type: 'button', class: 'primary', onClick: () => chargerMoniteur() }, info.valide ? 'Voir la saisie du jour' : 'Saisir la présence du jour'));
  }
  if (role === 'admin_esat') {
    const etat = (a) => (a.valide ? 'Validée' : (a.faits > 0 ? 'En cours (' + a.faits + '/' + a.total + ')' : (a.total === 0 ? 'Aucun travailleur' : 'Pas commencée')));
    return h('section', { class: 'banner stack', 'aria-labelledby': 't-afaire', style: 'align-items:flex-start' },
      h('h2', { id: 't-afaire' }, 'À faire aujourd’hui'),
      h('p', { style: 'font-weight:430' }, 'Vérifiez que chaque atelier a validé sa journée, puis consultez le tableau de bord ou les fiches mensuelles pour la paie.'),
      info.ateliers && info.ateliers.length
        ? h('ul', { class: 'list', style: 'gap:6px;font-weight:430;font-size:17px' }, info.ateliers.map((a) => h('li', {}, h('strong', {}, a.nom + ' : '), etat(a))))
        : null,
      info.aCloturer ? h('p', { style: 'font-weight:430' }, '🔒 ' + libelleMois(info.aCloturer.annee, info.aCloturer.mois) + ' est terminé mais pas encore clôturé. Clôturez-le une fois la paie préparée, pour que personne ne le modifie par erreur.') : null,
      h('div', { class: 'row', style: 'justify-content:flex-start' },
        h('button', { type: 'button', class: 'primary', onClick: () => chargerAdminEsat() }, 'Ouvrir le tableau de bord'),
        info.aCloturer ? h('button', { type: 'button', class: 'secondary', onClick: () => chargerReporting(info.aCloturer) }, 'Clôturer ' + minuscule(libelleMois(info.aCloturer.annee, info.aCloturer.mois))) : null,
        h('button', { type: 'button', class: 'secondary', onClick: () => chargerGestion() }, 'Gérer l’ESAT')));
  }
  return h('section', { class: 'banner stack', 'aria-labelledby': 't-afaire', style: 'align-items:flex-start' },
    h('h2', { id: 't-afaire' }, 'À faire aujourd’hui'),
    h('p', { style: 'font-weight:430' }, 'Gérez vos ESAT clients : ' + (info.nbEsat !== undefined ? info.nbEsat + ' ESAT enregistré' + (info.nbEsat > 1 ? 's' : '') + '. ' : '') + 'Créez les ateliers, importez les travailleurs et créez les accès de leurs administrateurs.'),
    h('button', { type: 'button', class: 'primary', onClick: () => chargerAdmin() }, 'Ouvrir l’espace éditeur'));
}

function rappelsDuJour() {
  const g = new Date().getDay();
  return (S.prefs.rappels || []).filter((r) => (r.jours || []).includes(g))
    .sort((a, b) => (a.heure || '99:99').localeCompare(b.heure || '99:99'));
}

function vueAccueil() {
  const info = S.accueil || { role: S.profil.role };
  const prenom = S.prefs && S.prefs.prenom;
  const rappels = rappelsDuJour();
  const total = (S.prefs.rappels || []).length;

  const liste = rappels.length === 0
    ? h('p', { class: 'muted' }, total === 0 ? 'Vous n’avez pas encore de rappel. Ajoutez-en jusqu’à 3 dans « Mon compte », par exemple « Vérifier que la liste est faite ».' : 'Aucun rappel pour aujourd’hui.')
    : h('ul', { class: 'list', style: 'gap:10px' }, rappels.map((r) => {
        const fait = lireFait(r);
        const id = 'fait-' + r.id;
        const coche = h('input', { type: 'checkbox', id, class: 'coche', checked: fait });
        const texte = h('span', { class: fait ? 'fait' : '' }, (r.heure ? r.heure + ' · ' : ''), r.texte);
        coche.addEventListener('change', () => { ecrireFait(r, coche.checked); texte.className = coche.checked ? 'fait' : ''; });
        return h('li', { class: 'rappel' }, coche, h('label', { for: id }, texte));
      }));

  render(pageAvec([
    navPrincipale('accueil'),
    h('div', { class: 'stack', style: 'gap:6px' },
      h('p', { class: 'muted' }, dateLongue()),
      h('h1', {}, prenom ? ['Bonjour ', h('em', {}, prenom)] : 'Bonjour')),
    blocAFaire(info),
    h('section', { class: 'card stack', 'aria-labelledby': 't-rappels' },
      h('div', { class: 'row' },
        h('h2', { id: 't-rappels' }, 'Mes rappels du jour'),
        h('button', { type: 'button', class: 'linkbtn', onClick: () => vueCompte() }, 'Gérer mes rappels')),
      liste),
    prenom ? null : h('p', { class: 'muted' }, 'Astuce : ajoutez votre prénom dans « Mon compte » pour personnaliser cet accueil.'),
    h('p', { class: 'muted' }, 'Une question ? ', h('button', { type: 'button', class: 'linkbtn', onClick: () => vueAide() }, 'Ouvrir l’aide et le support'))
  ]));
}

// --- Mon compte : prénom + rappels
function vueCompte(garder) {
  if (!garder || !S.c) S.c = { edition: null, texte: '', heure: '', jours: [1, 2, 3, 4, 5], err: '', msg: '' };
  const c = S.c;
  const rappels = S.prefs.rappels || [];
  const pleins = rappels.length >= RAPPELS_MAX && !c.edition;

  const prenomIn = h('input', { id: 'cpPrenom', class: 'in', type: 'text', maxlength: '40', autocomplete: 'given-name', value: S.prefs.prenom || '', style: 'max-width:340px' });
  const texteIn = h('input', { id: 'rpTexte', class: 'in', type: 'text', maxlength: '80', value: c.texte, disabled: pleins });
  const heureIn = h('input', { id: 'rpHeure', class: 'in', type: 'time', value: c.heure, disabled: pleins, style: 'max-width:160px' });
  texteIn.addEventListener('input', () => { c.texte = texteIn.value; });
  heureIn.addEventListener('input', () => { c.heure = heureIn.value; });

  const signaler = (err, msg) => { c.err = err || ''; c.msg = msg || ''; vueCompte(true); };

  const sauverPrenom = async () => {
    const r = await enregistrerPrefs(prenomIn.value.trim().slice(0, 40), S.prefs.rappels || []);
    if (r.erreur) return signaler('Enregistrement impossible : ' + r.erreur);
    signaler('', 'Prénom enregistré.');
  };
  const sauverRappel = async () => {
    const texte = texteIn.value.trim().slice(0, 80);
    if (!texte) return signaler('Écrivez ce que vous voulez vous rappeler.');
    if (!c.jours.length) return signaler('Choisissez au moins un jour.');
    const jours = c.jours.filter((j) => Number.isInteger(j) && j >= 0 && j <= 6);
    const neuf = { id: c.edition || Math.random().toString(36).slice(2, 8), texte, heure: /^\d{2}:\d{2}$/.test(c.heure) ? c.heure : '', jours };
    const liste = c.edition ? rappels.map((r) => (r.id === c.edition ? neuf : r)) : rappels.concat([neuf]);
    if (liste.length > RAPPELS_MAX) return signaler('Vous pouvez avoir 3 rappels au maximum.');
    const r = await enregistrerPrefs(S.prefs.prenom || '', liste);
    if (r.erreur) return signaler('Enregistrement impossible : ' + r.erreur);
    const edition = c.edition;
    S.c = { edition: null, texte: '', heure: '', jours: [1, 2, 3, 4, 5], err: '', msg: edition ? 'Rappel modifié.' : 'Rappel ajouté.' };
    vueCompte(true);
  };
  const supprimerRappel = async (r) => {
    const liste = rappels.filter((x) => x.id !== r.id);
    const rep = await enregistrerPrefs(S.prefs.prenom || '', liste);
    if (rep.erreur) return signaler('Suppression impossible : ' + rep.erreur);
    S.c = { edition: null, texte: '', heure: '', jours: [1, 2, 3, 4, 5], err: '', msg: 'Rappel supprimé.' };
    vueCompte(true);
  };
  const modifier = (r) => { S.c = { edition: r.id, texte: r.texte, heure: r.heure || '', jours: (r.jours || []).slice(), err: '', msg: '' }; vueCompte(true); };
  const annuler = () => { S.c = { edition: null, texte: '', heure: '', jours: [1, 2, 3, 4, 5], err: '', msg: '' }; vueCompte(true); };

  const jourCase = ([n, lib]) => {
    const id = 'rpj-' + n;
    const cb = h('input', { type: 'checkbox', id, class: 'coche', checked: c.jours.includes(n), disabled: pleins });
    cb.addEventListener('change', () => { c.jours = cb.checked ? c.jours.concat([n]) : c.jours.filter((x) => x !== n); });
    return h('span', { class: 'jourcase' }, cb, h('label', { for: id }, lib));
  };
  const libJours = (r) => {
    const j = r.jours || [];
    if (j.length === 7) return 'tous les jours';
    if ([1, 2, 3, 4, 5].every((x) => j.includes(x)) && j.length === 5) return 'du lundi au vendredi';
    return JOURS_RAPPEL.filter(([n]) => j.includes(n)).map(([, l]) => l).join(', ');
  };

  render(pageAvec([
    navPrincipale('compte'),
    h('div', { class: 'stack', style: 'gap:6px' },
      h('p', { class: 'muted' }, S.user.email + ' · ' + ROLES[S.profil.role]),
      h('h1', {}, 'Mon ', h('em', {}, 'compte'))),
    h('section', { class: 'card stack', 'aria-labelledby': 't-prenom' },
      h('h2', { id: 't-prenom' }, 'Mon prénom'),
      h('div', {}, h('label', { class: 'lbl', for: 'cpPrenom' }, 'Comment souhaitez-vous qu’on vous appelle ?'), prenomIn),
      h('div', {}, h('button', { type: 'button', class: 'primary', onClick: sauverPrenom }, 'Enregistrer mon prénom'))),
    h('section', { class: 'card stack', 'aria-labelledby': 't-mesrappels' },
      h('h2', { id: 't-mesrappels' }, 'Mes rappels'),
      h('p', { class: 'muted' }, 'Jusqu’à 3 rappels. Ils s’affichent sur votre page d’accueil les jours choisis, par exemple pour vérifier que la liste est faite. Ils ne sont visibles que par vous.'),
      rappels.length === 0 ? h('p', { class: 'muted' }, 'Aucun rappel pour l’instant.') : null,
      h('ul', { class: 'list', style: 'gap:10px' }, rappels.map((r) => h('li', { class: 'row' },
        h('span', {}, h('strong', {}, (r.heure ? r.heure + ' · ' : '') + r.texte), h('br'), h('span', { class: 'muted' }, libJours(r))),
        h('span', { class: 'row', style: 'gap:8px' },
          h('button', { type: 'button', class: 'linkbtn', 'aria-label': 'Modifier le rappel ' + r.texte, onClick: () => modifier(r) }, 'Modifier'),
          h('button', { type: 'button', class: 'rm', 'aria-label': 'Supprimer le rappel ' + r.texte, onClick: () => supprimerRappel(r) }, 'Supprimer'))))),
      h('div', { class: 'stack', style: 'border-top:1px solid #d3d3d8;padding-top:18px' },
        h('h3', {}, c.edition ? 'Modifier le rappel' : 'Ajouter un rappel'),
        pleins ? h('p', { class: 'muted' }, 'Vous avez déjà 3 rappels. Supprimez-en un pour en ajouter un autre.') : null,
        h('div', { class: 'fields' },
          h('div', { style: 'flex:3 1 260px' }, h('label', { class: 'lbl', for: 'rpTexte' }, 'Ce que je veux me rappeler'), texteIn),
          h('div', { style: 'flex:1 1 140px' }, h('label', { class: 'lbl', for: 'rpHeure' }, 'Heure (facultatif)'), heureIn)),
        h('div', { role: 'group', 'aria-labelledby': 'rpJoursLbl' },
          h('span', { class: 'lbl', id: 'rpJoursLbl' }, 'Les jours'),
          h('div', { class: 'jours' }, JOURS_RAPPEL.map(jourCase))),
        c.err ? h('p', { class: 'err', role: 'alert' }, c.err) : null,
        c.msg ? h('p', { class: 'ok', role: 'status' }, c.msg) : null,
        h('div', { class: 'row', style: 'justify-content:flex-start' },
          h('button', { type: 'button', class: 'primary', disabled: pleins, onClick: sauverRappel }, c.edition ? 'Enregistrer le rappel' : 'Ajouter le rappel'),
          c.edition ? h('button', { type: 'button', class: 'secondary', onClick: annuler }, 'Annuler') : null)))
  ]));
}

// ---------------------------------------------------------------------
// Connexion
// ---------------------------------------------------------------------
function vueConnexion(message) {
  const email = h('input', { id: 'email', class: 'in', type: 'email', autocomplete: 'username', required: true });
  const mdp = h('input', { id: 'mdp', class: 'in', type: 'password', autocomplete: 'current-password', required: true });
  const erreur = h('p', { class: 'err', role: 'alert' }, message || '');
  const bouton = h('button', { type: 'submit', class: 'primary' }, 'Se connecter');

  const form = h('form', {
    class: 'card login',
    onSubmit: async (e) => {
      e.preventDefault();
      bouton.disabled = true;
      erreur.textContent = '';
      const { error } = await sb.auth.signInWithPassword({ email: email.value.trim(), password: mdp.value });
      if (error) {
        erreur.textContent = 'E-mail ou mot de passe incorrect.';
        bouton.disabled = false;
        return;
      }
      await demarrer();
    }
  },
    h('img', { src: 'logo.png', alt: 'Atelio' }),
    h('h1', {}, 'Heureux de vous ', h('em', {}, 'revoir')),
    champ('email', 'Adresse e-mail', email),
    champ('mdp', 'Mot de passe', mdp),
    erreur,
    bouton,
    h('button', { type: 'button', class: 'linkbtn', onClick: vueMotDePasseOublie }, 'Mot de passe oublié ?'),
    h('p', { class: 'muted' }, 'Il n’y a pas d’inscription libre : votre accès est créé par l’éditeur d’Atelio ou par la direction de votre ESAT.')
  );
  render(h('main', { class: 'center' }, form));
}

// Mot de passe oublié : pas d'envoi d'e-mail automatique, c'est la personne responsable qui en donne un nouveau.
function vueMotDePasseOublie() {
  render(h('main', { class: 'center' }, h('section', { class: 'card login', 'aria-labelledby': 't-oubli' },
    h('img', { src: 'logo.png', alt: 'Atelio' }),
    h('h1', { id: 't-oubli' }, 'Mot de passe oublié'),
    h('p', {}, 'Pas d’inquiétude, c’est rapide :'),
    h('ul', { class: 'list', style: 'gap:10px' },
      h('li', {}, h('strong', {}, 'Moniteur : '), 'demandez à la direction de votre ESAT de vous donner un nouveau mot de passe provisoire.'),
      h('li', {}, h('strong', {}, 'Direction de l’ESAT : '), 'contactez l’éditeur d’Atelio, qui vous en donnera un nouveau.')),
    h('p', { class: 'muted' }, 'Avec ce mot de passe provisoire, vous pourrez vous connecter, puis vous choisirez tout de suite un nouveau mot de passe que vous seul connaissez.'),
    h('button', { type: 'button', class: 'primary', onClick: () => vueConnexion() }, 'Retour à la connexion'))));
}

// ---------------------------------------------------------------------
// Démarrage : qui est connecté, et où l'envoyer ?
// ---------------------------------------------------------------------
async function demarrer() {
  render(h('main', { class: 'center' }, h('p', { class: 'muted' }, 'Chargement…')));
  const { data } = await sb.auth.getSession();
  if (!data.session) return vueConnexion();
  S.user = data.session.user;
  if (S.user.user_metadata && S.user.user_metadata.mdp_temporaire === true && !S.mdpFait) return vueChangerMdp();

  const { data: profil, error } = await sb
    .from('profils').select('id, role, email, esat_id, atelier_id')
    .eq('id', S.user.id).maybeSingle();

  if (error || !profil) {
    return vueMessage('Compte non rattaché',
      'Votre connexion fonctionne, mais votre compte n’est pas encore rattaché à un ESAT. Contactez l’éditeur d’Atelio.');
  }
  S.profil = profil;

  await chargerPrefs();
  await chargerMarque();
  return chargerAccueil();
}

// ---------------------------------------------------------------------
// ÉCRAN MONITEUR
// ---------------------------------------------------------------------
const JOURS_ARRIERE_MAX = 92; // on peut corriger un jour passé, jusqu'à environ 3 mois en arrière

async function chargerMoniteur(jourChoisi) {
  const p = S.profil;
  if (!p.atelier_id) {
    return vueMessage('Aucun atelier attribué', 'Aucun atelier ne vous est encore attribué. Contactez la direction de votre ESAT.');
  }
  const aujourdhui = aujourdhuiISO();
  const minimum = decalerJour(aujourdhui, -JOURS_ARRIERE_MAX);
  const jour = (typeof jourChoisi === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(jourChoisi) && jourChoisi <= aujourdhui && jourChoisi >= minimum)
    ? jourChoisi : aujourdhui;
  if (jourChoisi === undefined) S.abs = null;
  const [a, e, st, tr, pr, va, cl, ap, fe] = await Promise.all([
    sb.from('ateliers').select('nom').eq('id', p.atelier_id).maybeSingle(),
    sb.from('esats').select('nom').eq('id', p.esat_id).maybeSingle(),
    sb.from('statuts').select('id, code, nom, couleur, ordre, esat_id').order('ordre').order('code'),
    sb.from('travailleurs').select('*').eq('atelier_id', p.atelier_id).eq('actif', true).order('nom').order('prenom'),
    sb.from('presences').select('travailleur_id, statut_id').eq('jour', jour),
    sb.from('journees_validees').select('atelier_id').eq('atelier_id', p.atelier_id).eq('jour', jour).maybeSingle(),
    sb.from('mois_clotures').select('mois').eq('mois', premierDuMois(+jour.slice(0, 4), +jour.slice(5, 7) - 1)).maybeSingle(),
    sb.from('absences_prevues').select('id, travailleur_id, statut_id, debut, fin, note').gte('fin', jour < aujourdhui ? jour : aujourdhui).order('debut'),
    sb.from('jours_fermes').select('motif').eq('jour', jour).maybeSingle()
  ]);
  const ko = [a, e, st, tr, pr, va].find((r) => r.error);
  if (ko) return vueMessage('Chargement impossible', ko.error.message);

  const saisieJour = Object.fromEntries(pr.data.map((r) => [r.travailleur_id, r.statut_id]));
  const ferie = mapFermes(fe && !fe.error && fe.data ? [fe.data] : [], [+jour.slice(0, 4)])[jour] || '';
  const gJour = dateDepuisISO(jour).getDay();
  const prevu = {};
  if (!ferie && gJour >= 1 && gJour <= 5 && !ap.error) {
    ap.data.forEach((it) => {
      if (it.debut <= jour && jour <= it.fin && !saisieJour[it.travailleur_id] && tr.data.some((w) => w.id === it.travailleur_id && creneau(w, jour)) && st.data.some((s) => s.id === it.statut_id)) prevu[it.travailleur_id] = it.statut_id;
    });
  }
  S.m = {
    prevu, prevues: ap.error ? [] : ap.data, ferie,
    jour,
    atelier: a.data ? a.data.nom : '',
    esat: e.data ? e.data.nom : '',
    statuts: st.data,
    travailleurs: tr.data,
    saisie: Object.fromEntries(pr.data.map((r) => [r.travailleur_id, r.statut_id])),
    valide: !!va.data,
    verrou: !!(cl && !cl.error && cl.data),
    msg: ''
  };
  vueMoniteur();
}

async function choisirStatut(travailleurId, statutId) {
  const m = S.m;
  if (m.valide || m.verrou) return;
  const avant = m.saisie[travailleurId];
  const etaitPrevu = m.prevu[travailleurId];
  m.saisie[travailleurId] = statutId;
  delete m.prevu[travailleurId];
  m.msg = '';
  vueMoniteur();
  const { error } = await sb.from('presences').upsert(
    { esat_id: S.profil.esat_id, travailleur_id: travailleurId, jour: m.jour, statut_id: statutId, saisi_par: S.user.id },
    { onConflict: 'travailleur_id,jour' }
  );
  if (error) {
    if (avant) m.saisie[travailleurId] = avant; else delete m.saisie[travailleurId];
    if (etaitPrevu) m.prevu[travailleurId] = etaitPrevu;
    m.msg = 'Enregistrement impossible : ' + error.message;
    vueMoniteur();
  }
}

async function toutLeMondePresent() {
  const m = S.m;
  if (m.valide || m.verrou) return;
  const present = m.statuts.find((s) => s.code === 'P' && !s.esat_id);
  if (!present) return;
  // Les absences prévues sont appliquées à la place de « Présent » pour les personnes concernées
  const lignes = m.travailleurs.filter((w) => creneau(w, m.jour)).map((w) => ({
    esat_id: S.profil.esat_id, travailleur_id: w.id, jour: m.jour, statut_id: m.prevu[w.id] || present.id, saisi_par: S.user.id
  }));
  const avant = { ...m.saisie };
  const prevuAvant = m.prevu;
  lignes.forEach((l) => { m.saisie[l.travailleur_id] = l.statut_id; });
  m.prevu = {};
  m.msg = '';
  vueMoniteur();
  const { error } = await sb.from('presences').upsert(lignes, { onConflict: 'travailleur_id,jour' });
  if (error) {
    m.saisie = avant;
    m.prevu = prevuAvant;
    m.msg = 'Enregistrement impossible : ' + error.message;
    vueMoniteur();
  }
}

async function appliquerPrevues() {
  const m = S.m;
  if (m.valide || m.verrou) return;
  const ids = Object.keys(m.prevu);
  if (!ids.length) return;
  const lignes = ids.map((id) => ({ esat_id: S.profil.esat_id, travailleur_id: id, jour: m.jour, statut_id: m.prevu[id], saisi_par: S.user.id }));
  const avant = { ...m.saisie };
  const prevuAvant = m.prevu;
  lignes.forEach((l) => { m.saisie[l.travailleur_id] = l.statut_id; });
  m.prevu = {};
  m.msg = '';
  vueMoniteur();
  const { error } = await sb.from('presences').upsert(lignes, { onConflict: 'travailleur_id,jour' });
  if (error) {
    m.saisie = avant;
    m.prevu = prevuAvant;
    m.msg = 'Enregistrement impossible : ' + error.message;
    vueMoniteur();
  }
}

async function validerJournee() {
  const m = S.m;
  const { error } = await sb.from('journees_validees').insert({
    atelier_id: S.profil.atelier_id, jour: m.jour, esat_id: S.profil.esat_id, valide_par: S.user.id
  });
  if (error) { m.msg = 'Validation impossible : ' + error.message; } else { m.valide = true; m.msg = ''; }
  vueMoniteur();
}

async function rouvrirJournee() {
  const m = S.m;
  const { error } = await sb.from('journees_validees').delete()
    .eq('atelier_id', S.profil.atelier_id).eq('jour', m.jour);
  if (error) { m.msg = 'Modification impossible : ' + error.message; } else { m.valide = false; m.msg = ''; }
  vueMoniteur();
}

function vueMoniteur() {
  const m = S.m;
  const codes = m.statuts.map((s) => s.id);
  // Seuls les travailleurs attendus ce jour-là comptent (les autres ne travaillent pas ce jour selon leurs horaires)
  const attendu = (w) => !!creneau(w, m.jour) || !!m.saisie[w.id];
  const presentsAttendus = m.travailleurs.filter(attendu);
  const total = presentsAttendus.length;
  const faits = presentsAttendus.filter((w) => codes.includes(m.saisie[w.id])).length;
  const reste = total - faits;
  const aujourdhui = aujourdhuiISO();
  const estAujourdhui = m.jour === aujourdhui;
  const minimum = decalerJour(aujourdhui, -JOURS_ARRIERE_MAX);
  const fige = m.valide || m.verrou;
  const nbPrevu = Object.keys(m.prevu).length;

  // Choix du jour : pour corriger une saisie passée
  const champJour = h('input', {
    id: 'jourSaisie', class: 'in', type: 'date', value: m.jour, max: aujourdhui, min: minimum, style: 'width:auto;min-width:190px',
    onChange: (e) => { if (e.target.value) chargerMoniteur(e.target.value); }
  });
  const choixJour = h('div', { class: 'row', style: 'justify-content:flex-start;align-items:flex-end', role: 'group', 'aria-label': 'Choix du jour' },
    h('button', { type: 'button', class: 'secondary', disabled: m.jour <= minimum, onClick: () => chargerMoniteur(decalerJour(m.jour, -1)) }, '‹ Jour précédent'),
    h('div', {}, h('label', { class: 'lbl', for: 'jourSaisie' }, 'Jour'), champJour),
    h('button', { type: 'button', class: 'secondary', disabled: estAujourdhui, onClick: () => chargerMoniteur(decalerJour(m.jour, 1)) }, 'Jour suivant ›'),
    estAujourdhui ? null : h('button', { type: 'button', class: 'primary', onClick: () => chargerMoniteur() }, 'Revenir à aujourd’hui'));

  const titre = h('div', { class: 'stack', style: 'gap:14px' },
    navPrincipale('saisie'),
    h('p', { class: 'muted' }, m.esat),
    h('h1', { style: 'margin-top:4px' }, 'Atelier ', h('em', {}, m.atelier)),
    h('p', { style: 'margin-top:8px;font-size:20px;font-weight:500' }, dateLongue(m.jour),
      estAujourdhui ? null : h('span', { class: 'tag', style: 'margin-left:12px;vertical-align:middle' }, 'Jour passé')),
    choixJour
  );

  if (m.travailleurs.length === 0) {
    return render(pageAvec([titre, h('div', { class: 'card stack' },
      h('h2', {}, 'Aucun travailleur dans cet atelier pour l’instant'),
      h('p', { class: 'muted' }, 'La direction de votre ESAT doit d’abord ajouter les travailleurs de l’atelier.'))]));
  }

  // Le moniteur ne voit que « Présent » et « Absent ». « Absent » ouvre la liste des motifs
  // (tous les autres statuts de l'ESAT : Congés payés, Maladie, statuts personnalisés...).
  const sP = m.statuts.find((s) => s.code === 'P' && !s.esat_id);
  const sA = m.statuts.find((s) => s.code === 'A' && !s.esat_id);
  const motifs = m.statuts.filter((s) => s !== sP);

  const bouton = (s, texte, onClick, selectionne) => h('button', {
    type: 'button', class: 'st' + (selectionne ? ' sel' : ''),
    style: '--c:' + couleurSure(s.couleur), 'aria-pressed': String(selectionne),
    disabled: fige, onClick
  }, h('span', { class: 'code' }, s.code), h('span', {}, texte));

  const lignes = m.travailleurs.map((w) => {
    const nomW = w.prenom + ' ' + w.nom;
    const cur = m.statuts.find((s) => s.id === m.saisie[w.id]);
    const cr = creneau(w, m.jour);
    const demi = cr === 'M' || cr === 'A' ? h('span', { class: 'tag', style: 'margin-left:8px', title: 'Horaire de ' + w.prenom + ' ce jour-là' }, LIBELLE_CRENEAU[cr]) : null;
    const identite = [h('td', { class: 'nomcol' }, w.nom), h('td', {}, w.prenom, demi)];
    if (!attendu(w)) {
      return h('tr', { class: 'absent', style: 'opacity:.65' }, identite,
        h('td', { colspan: '2' }, h('span', { class: 'vide-motif' }, 'Ne travaille pas ce jour (horaires)')));
    }
    if (!sP || !sA) {
      // Sécurité : si les statuts de base manquent, on affiche tous les statuts.
      return h('tr', {}, identite,
        h('td', { colspan: '2' }, h('div', { class: 'opts', role: 'group', 'aria-label': 'Statut de ' + nomW },
          m.statuts.map((s) => bouton(s, s.nom, () => choisirStatut(w.id, s.id), cur === s)))));
    }
    const present = cur === sP;
    const absent = !!cur && cur !== sP;
    const idPrevu = m.prevu[w.id];
    const sPrevu = idPrevu && !cur ? m.statuts.find((s) => s.id === idPrevu) : null;
    const motif = absent
      ? h('select', {
          class: 'in motif', 'aria-label': 'Motif de l’absence de ' + nomW, disabled: fige,
          onChange: (e) => choisirStatut(w.id, e.target.value)
        }, motifs.map((s) => h('option', { value: s.id, selected: s === cur }, s === sA ? 'Non précisé' : s.nom)))
      : (sPrevu
        ? h('div', { class: 'prevu' }, h('span', {}, 'Prévu : ' + (sPrevu === sA ? 'Absent' : sPrevu.nom)),
            h('button', { type: 'button', class: 'linkbtn', disabled: fige, onClick: () => choisirStatut(w.id, sPrevu.id) }, 'Confirmer'))
        : h('span', { class: 'vide-motif' }, '—'));
    return h('tr', { class: absent ? 'absent' : '' }, identite,
      h('td', {}, h('div', { class: 'opts', role: 'group', 'aria-label': 'Présence de ' + nomW },
        bouton(sP, 'Présent', () => choisirStatut(w.id, sP.id), present),
        bouton(sA, 'Absent', () => { if (!absent) choisirStatut(w.id, sA.id); }, absent))),
      h('td', {}, motif));
  });

  const tableau = h('div', { class: 'scroll' }, h('table', { class: 'tbl saisie' },
    h('caption', { class: 'sr' }, 'Présences de l’atelier ' + m.atelier + ', ' + dateLongue(m.jour)),
    h('thead', {}, h('tr', {}, h('th', {}, 'Nom'), h('th', {}, 'Prénom'), h('th', {}, 'Présence'), h('th', {}, 'Motif de l’absence'))),
    h('tbody', {}, lignes)));

  const recap = h('div', { class: 'card stack' },
    h('h2', {}, 'Récapitulatif de la journée'),
    h('div', { class: 'chips' }, m.statuts.map((s) => {
      const n = presentsAttendus.filter((w) => m.saisie[w.id] === s.id).length;
      return h('span', { class: 'chip', style: '--c:' + couleurSure(s.couleur) },
        h('span', { class: 'code' }, s.code), s.nom + ' : ' + n);
    }))
  );

  const bas = m.verrou
    ? h('div', { class: 'banner', role: 'status' },
        h('span', {}, '🔒 Ce mois est clôturé par la direction : les présences ne peuvent plus être modifiées. Si une correction est nécessaire, contactez-la.'))
    : m.valide
    ? h('div', { class: 'banner', role: 'status' },
        h('span', {}, 'Journée validée. L’administration peut maintenant la consulter pour la paie.'),
        h('button', { type: 'button', class: 'secondary', onClick: rouvrirJournee }, 'Modifier la saisie'))
    : h('div', { class: 'row' },
        h('p', {}, reste > 0
          ? 'Il reste ' + reste + (reste > 1 ? ' personnes' : ' personne') + ' à renseigner.'
          : 'Tout est renseigné : vous pouvez valider la journée.'),
        h('button', { type: 'button', class: 'primary', disabled: reste > 0, onClick: validerJournee }, 'Valider la journée'));

  render(pageAvec([
    titre,
    m.ferie ? h('div', { class: 'banner', role: 'status' }, h('span', {}, 'Jour férié ou fermeture : ' + m.ferie + '. L’ESAT est fermé ce jour-là ; saisissez uniquement si des personnes ont travaillé.')) : null,
    h('div', { class: 'card stack' },
      h('div', { class: 'row' },
        h('p', { style: 'font-size:20px;font-weight:500' }, faits + ' sur ' + total + ' personnes renseignées'),
        h('div', { class: 'row', style: 'gap:10px' },
          nbPrevu > 0 ? h('button', { type: 'button', class: 'secondary', disabled: fige, onClick: appliquerPrevues }, 'Appliquer les absences prévues (' + nbPrevu + ')') : null,
          h('button', { type: 'button', class: 'secondary', disabled: fige, onClick: toutLeMondePresent }, 'Tout le monde est présent'))),
      h('div', { class: 'bar', 'aria-hidden': 'true' }, h('div', { style: 'width:' + (total ? Math.round((faits / total) * 100) : 0) + '%' }))
    ),
    m.msg ? h('p', { class: 'err', role: 'alert' }, m.msg) : null,
    tableau,
    recap,
    bas,
    blocAbsencesPrevues(ctxAbsences({
      workers: m.travailleurs.map((w) => ({ ...w, actif: true, atelier_id: S.profil.atelier_id })), ateliers: [{ id: S.profil.atelier_id, nom: m.atelier }],
      statuts: m.statuts, items: m.prevues, parAtelier: false,
      redessiner: () => vueMoniteur(), recharger: () => chargerMoniteur(m.jour)
    }))
  ]));
}

// ---------------------------------------------------------------------
// ESPACE ÉDITEUR (super-admin)
// ---------------------------------------------------------------------
async function chargerAdmin(selectionId) {
  if (S.supEd === undefined) S.supEd = await lireSupport();
  const [es, st, pf] = await Promise.all([
    sb.from('esats').select('id, nom, cree_le').order('cree_le'),
    sb.from('statuts').select('id, esat_id, code, nom, couleur, ordre').order('ordre').order('code'),
    sb.from('profils').select('id, email, role, esat_id')
  ]);
  const ko = [es, st, pf].find((r) => r.error);
  if (ko) return vueMessage('Chargement impossible', ko.error.message);

  const ancien = S.a || {};
  S.a = {
    esats: es.data, statuts: st.data, profils: pf.data,
    sel: selectionId || ancien.sel || (es.data[0] ? es.data[0].id : null),
    couleur: ancien.couleur || COULEURS[0].hex,
    msgEsat: '', errEsat: '', msgStatut: '', errStatut: ''
  };
  vueAdmin();
}

async function ajouterEsat(nomInput) {
  const nom = nomInput.value.trim();
  if (!nom) { S.a.errEsat = 'Renseignez le nom de l’ESAT.'; S.a.msgEsat = ''; return vueAdmin(); }
  const { data, error } = await sb.from('esats').insert({ nom }).select('id').single();
  if (error) { S.a.errEsat = 'Création impossible : ' + error.message; S.a.msgEsat = ''; return vueAdmin(); }
  await chargerAdmin(data.id);
  S.a.msgEsat = 'ESAT « ' + nom + ' » créé.';
  vueAdmin();
}

// ---------------------------------------------------------------------
// STATUTS ET MOTIFS D'ABSENCE : partagé entre l'éditeur et l'administrateur d'ESAT.
// « ctx » dit où sont les données : get() renvoie l'état, id() l'ESAT concerné,
// redraw() réaffiche l'écran, reload() recharge les données depuis la base.
// ---------------------------------------------------------------------
const CTX_A = { get: () => S.a, id: () => S.a.sel, redraw: () => vueAdmin(), reload: () => chargerAdmin(S.a.sel) };
const CTX_T = { get: () => S.t, id: () => S.t.esatId, redraw: () => vueStatutsEsat(), reload: () => chargerStatutsEsat(true) };

async function enregistrerStatut(ctx, nomInput, codeInput) {
  const st = ctx.get();
  const esatId = ctx.id();
  const echec = (t) => { st.errStatut = t; st.msgStatut = ''; ctx.redraw(); };
  const nom = nomInput.value.trim().slice(0, 40);
  const code = codeInput.value.trim().toUpperCase();
  if (!nom || !code) return echec('Renseignez le nom et le code du statut.');
  if (!/^#[0-9a-fA-F]{6}$/.test(st.couleur) || contrasteBlanc(st.couleur) < 4.5) return echec('Choisissez une couleur plus foncée : le texte blanc doit rester lisible.');
  const edition = st.edition || null;
  const existe = st.statuts.some((s) => (s.esat_id === null || s.esat_id === esatId) && s.id !== edition && s.code.toUpperCase() === code);
  if (existe) return echec('Ce code existe déjà pour cet ESAT : choisissez-en un autre.');
  const existeNom = st.statuts.some((s) => (s.esat_id === null || s.esat_id === esatId) && s.id !== edition && norm(s.nom) === norm(nom));
  if (existeNom) return echec('Un statut porte déjà ce nom.');
  const { error } = edition
    ? await sb.from('statuts').update({ code, nom, couleur: st.couleur }).eq('id', edition).eq('esat_id', esatId)
    : await sb.from('statuts').insert({ esat_id: esatId, code, nom, couleur: st.couleur, ordre: 100 });
  if (error) return echec((edition ? 'Modification' : 'Ajout') + ' impossible : ' + error.message);
  await ctx.reload();
  const neuf = ctx.get();
  neuf.msgStatut = 'Statut « ' + nom + ' » ' + (edition ? 'modifié.' : 'ajouté.');
  ctx.redraw();
}

async function supprimerStatut(ctx, statut) {
  const st = ctx.get();
  const { error } = await sb.from('statuts').delete().eq('id', statut.id).eq('esat_id', ctx.id());
  if (error) {
    st.errStatut = error.code === '23503'
      ? 'Ce statut est déjà utilisé dans des présences : il ne peut pas être supprimé.'
      : 'Suppression impossible : ' + error.message;
    st.msgStatut = '';
    return ctx.redraw();
  }
  await ctx.reload();
  ctx.get().msgStatut = 'Statut « ' + statut.nom + ' » supprimé.';
  ctx.redraw();
}

function blocStatuts(ctx) {
  const st = ctx.get();
  const esatId = ctx.id();
  const base = st.statuts.filter((s) => s.esat_id === null);
  const perso = st.statuts.filter((s) => s.esat_id === esatId);
  const edition = st.edition ? perso.find((s) => s.id === st.edition) : null;
  const nom = h('input', { id: 'stNom', class: 'in', type: 'text', maxlength: '40', value: st.stNom || '' });
  const code = h('input', { id: 'stCode', class: 'in', type: 'text', maxlength: '4', value: st.stCode || '' });
  nom.addEventListener('input', () => { st.stNom = nom.value; });
  code.addEventListener('input', () => { code.value = code.value.toUpperCase(); st.stCode = code.value; });
  const faible = contrasteBlanc(st.couleur) < 4.5;
  const dansPalette = COULEURS.some((c) => c.hex.toLowerCase() === st.couleur.toLowerCase());
  const choisir = (hex) => { st.couleur = hex; st.errStatut = ''; st.msgStatut = ''; ctx.redraw(); };
  const modifier = (s) => { st.edition = s.id; st.stNom = s.nom; st.stCode = s.code; st.couleur = s.couleur; st.errStatut = ''; st.msgStatut = ''; ctx.redraw(); };
  const annuler = () => { st.edition = null; st.stNom = ''; st.stCode = ''; st.errStatut = ''; st.msgStatut = ''; ctx.redraw(); };

  return h('div', { class: 'card stack' },
    h('h2', {}, 'Statuts de présence de cet ESAT'),
    h('div', { class: 'stack', style: 'gap:8px' },
      h('h3', {}, 'Statuts de base (identiques pour tous les ESAT)'),
      h('div', { class: 'chips' }, base.map(pastille)),
      h('p', { class: 'muted' }, 'Les statuts de base ne peuvent pas être modifiés.')),
    h('div', { class: 'stack', style: 'gap:8px' },
      h('h3', {}, 'Statuts propres à cet ESAT'),
      h('p', { class: 'muted' }, 'Le moniteur voit « Présent » et « Absent ». Quand il choisit « Absent », il peut préciser le motif parmi tous les autres statuts : ceux de base et ceux que vous ajoutez ici.'),
      perso.length === 0 ? h('p', { class: 'muted' }, 'Aucun statut spécifique pour l’instant.') : null,
      h('ul', { class: 'list', style: 'gap:10px' }, perso.map((s) => h('li', { class: 'row' },
        pastille(s),
        h('span', { class: 'row', style: 'gap:8px' },
          h('button', { type: 'button', class: 'linkbtn', 'aria-label': 'Modifier le statut ' + s.nom, onClick: () => modifier(s) }, 'Modifier'),
          h('button', { type: 'button', class: 'rm', 'aria-label': 'Supprimer le statut ' + s.nom, onClick: () => supprimerStatut(ctx, s) }, 'Supprimer')))))),
    h('div', { class: 'stack', style: 'border-top:1px solid #d3d3d8;padding-top:18px' },
      h('h3', {}, edition ? 'Modifier le statut « ' + edition.nom + ' »' : 'Ajouter un statut pour cet ESAT'),
      h('div', { class: 'fields' },
        h('div', { style: 'flex:2 1 220px' }, h('label', { class: 'lbl', for: 'stNom' }, 'Nom du statut (ex. Formation)'), nom),
        h('div', { style: 'flex:1 1 120px' }, h('label', { class: 'lbl', for: 'stCode' }, 'Code (4 signes max.)'), code)),
      h('div', { class: 'stack', style: 'gap:10px' },
        h('span', { class: 'lbl', id: 'couleurLbl', style: 'margin:0' }, 'Couleur'),
        h('div', { class: 'chips', role: 'group', 'aria-labelledby': 'couleurLbl', style: 'gap:12px' },
          COULEURS.map((c) => h('button', {
            type: 'button', class: 'sw' + (st.couleur.toLowerCase() === c.hex.toLowerCase() ? ' on' : ''), style: '--c:' + c.hex,
            title: c.nom, 'aria-label': c.nom, 'aria-pressed': String(st.couleur.toLowerCase() === c.hex.toLowerCase()),
            onClick: () => choisir(c.hex)
          }))),
        h('div', { class: 'row', style: 'justify-content:flex-start;gap:12px' },
          h('label', { class: 'lbl', for: 'couleurLibre', style: 'margin:0' }, 'Ou une autre couleur :'),
          h('input', { id: 'couleurLibre', type: 'color', value: st.couleur, class: 'sw-libre', onChange: (e) => choisir(e.target.value) }),
          h('span', { class: 'muted' }, dansPalette ? '' : 'Couleur personnalisée ' + st.couleur.toUpperCase())),
        h('div', { class: 'row', style: 'justify-content:flex-start;gap:12px' },
          h('span', { class: 'muted' }, 'Aperçu :'),
          h('span', { class: 'chip', style: '--c:' + couleurSure(st.couleur) }, h('span', { class: 'code' }, 'EX'), 'Exemple')),
        faible ? h('p', { class: 'err', role: 'alert' }, 'Cette couleur est trop claire : le texte blanc ne serait pas lisible. Choisissez-en une plus foncée.') : null),
      st.errStatut ? h('p', { class: 'err', role: 'alert' }, st.errStatut) : null,
      st.msgStatut ? h('p', { class: 'ok', role: 'status' }, st.msgStatut) : null,
      h('div', { class: 'row', style: 'justify-content:flex-start;gap:12px' },
        h('button', { type: 'button', class: 'primary', onClick: () => enregistrerStatut(ctx, nom, code) }, edition ? 'Enregistrer les modifications' : 'Ajouter ce statut'),
        edition ? h('button', { type: 'button', class: 'secondary', onClick: annuler }, 'Annuler') : null)));
}

function pastille(s) {
  return h('span', { class: 'chip', style: '--c:' + couleurSure(s.couleur) }, h('span', { class: 'code' }, s.code), s.nom);
}

function vueAdmin() {
  const a = S.a;
  const esat = a.esats.find((e) => e.id === a.sel);

  const nomEsat = h('input', { id: 'nomEsat', class: 'in', type: 'text' });
  const colGauche = h('section', { class: 'col-a', 'aria-labelledby': 't-clients' },
    h('div', { class: 'card stack' },
      h('h2', { id: 't-clients' }, 'Mes clients (ESAT)'),
      a.esats.length === 0 ? h('p', { class: 'muted' }, 'Aucun ESAT pour l’instant.') : null,
      h('ul', { class: 'list', style: 'gap:10px' }, a.esats.map((e) => {
        const nb = a.profils.filter((p) => p.esat_id === e.id).length;
        return h('li', {}, h('button', {
          type: 'button', class: 'esatbtn' + (e.id === a.sel ? ' on' : ''), 'aria-pressed': String(e.id === a.sel),
          onClick: () => { a.sel = e.id; a.errStatut = ''; a.msgStatut = ''; a.stNom = ''; a.stCode = ''; a.edition = null; vueAdmin(); }
        }, h('span', {}, e.nom), h('small', {}, nb + (nb > 1 ? ' comptes' : ' compte'))));
      }))
    ),
    h('div', { class: 'card stack' },
      h('h2', {}, 'Ajouter un ESAT client'),
      champ('nomEsat', 'Nom de l’ESAT', nomEsat),
      a.errEsat ? h('p', { class: 'err', role: 'alert' }, a.errEsat) : null,
      a.msgEsat ? h('p', { class: 'ok', role: 'status' }, a.msgEsat) : null,
      h('button', { type: 'button', class: 'primary', onClick: () => ajouterEsat(nomEsat) }, 'Créer l’ESAT'),
      h('p', { class: 'muted' }, 'Ensuite, ouvrez « Gérer les ateliers et les travailleurs » pour créer ses ateliers et le compte de son administrateur.')
    )
  );

  let colDroite;
  if (!esat) {
    colDroite = h('section', { class: 'col-b' }, h('div', { class: 'card' }, h('p', {}, 'Créez ou sélectionnez un ESAT pour gérer ses statuts.')));
  } else {
    const comptes = a.profils.filter((p) => p.esat_id === esat.id);

    colDroite = h('section', { class: 'col-b', 'aria-labelledby': 't-detail' },
      h('div', { class: 'card stack' },
        h('p', { class: 'muted' }, 'ESAT sélectionné'),
        h('h2', { id: 't-detail', style: 'font-size:26px' }, esat.nom),
        h('p', { class: 'muted' }, 'Pour une première mise en route : créer les ateliers, importer la liste Excel des travailleurs et créer les accès, à la place de l’ESAT.'),
        h('div', {}, h('button', { type: 'button', class: 'primary', onClick: () => chargerGestion(false, esat.id) }, 'Gérer les ateliers et les travailleurs')),
        h('h3', {}, 'Comptes rattachés'),
        comptes.length === 0
          ? h('p', { class: 'muted' }, 'Aucun compte pour l’instant.')
          : h('ul', { class: 'list', style: 'gap:6px' }, comptes.map((c) => h('li', {}, c.email + ' · ' + ROLES[c.role])))
      ),
      blocStatuts(CTX_A)
    );
  }

  render(pageAvec([
    navPrincipale('editeur'),
    h('div', { class: 'stack', style: 'gap:8px' },
      h('h1', {}, 'Espace ', h('em', {}, 'éditeur')),
      h('p', { class: 'muted' }, 'Vous gérez les ESAT clients, leurs statuts et leurs comptes, et vous pouvez préparer leurs ateliers et leurs travailleurs. Vous ne voyez jamais les présences.')),
    h('section', { class: 'card stack', 'aria-labelledby': 't-supEd' },
      h('h2', { id: 't-supEd' }, 'Adresse de support des administrateurs'),
      h('p', { class: 'muted' }, 'Dans « Aide et support », les administrateurs d’ESAT écrivent à cette adresse (bouton « Écrire au support »). Les moniteurs, eux, écrivent à leur administrateur.'),
      h('div', { class: 'row', style: 'justify-content:flex-start;align-items:flex-end;gap:12px;flex-wrap:wrap' },
        h('div', { style: 'flex:1;min-width:260px' }, h('label', { class: 'lbl', for: 'supEd' }, 'Adresse e-mail'),
          h('input', { id: 'supEd', type: 'email', autocomplete: 'off', placeholder: 'ex. support@atelio.fr', value: S.supEd || '' })),
        h('button', { type: 'button', class: 'primary', onClick: enregistrerSupportEditeur }, 'Enregistrer')),
      S.supMsg ? h('p', { class: S.supMsg.ko ? 'err' : 'ok', role: S.supMsg.ko ? 'alert' : 'status' }, S.supMsg.t) : null),
    h('div', { class: 'cols' }, colGauche, colDroite)
  ], true));
}

async function enregistrerSupportEditeur() {
  const v = (document.getElementById('supEd').value || '').trim();
  if (v && !MAIL_OK.test(v)) { S.supMsg = { ko: true, t: 'Adresse e-mail invalide.' }; return chargerAdmin(); }
  const { error } = await sb.rpc('maj_support_editeur', { p_email: v || null });
  if (error) {
    S.supMsg = { ko: true, t: /maj_support|does not exist|schema cache/i.test(error.message)
      ? 'Option non activée : exécutez d’abord atelio-v22.sql dans Supabase.' : 'Enregistrement impossible : ' + error.message };
  } else { S.supEd = v; S.supMsg = { ko: false, t: v ? 'Adresse enregistrée.' : 'Adresse retirée.' }; }
  chargerAdmin();
}

// ---------------------------------------------------------------------
// TABLEAU DE BORD (administrateur d'ESAT) : calendrier mensuel
// ---------------------------------------------------------------------
const JOURS_LETTRES = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

function nbJours(a, m) { return new Date(a, m + 1, 0).getDate(); }
function isoJour(a, m, j) { return a + '-' + String(m + 1).padStart(2, '0') + '-' + String(j).padStart(2, '0'); }
function libelleMois(a, m) {
  const t = new Date(a, m, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// Supabase renvoie 1000 lignes au maximum par demande : on lit par paquets.
async function toutLire(creer) {
  const lignes = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await creer().range(i, i + 999);
    if (error) return { error };
    lignes.push(...data);
    if (data.length < 1000) break;
  }
  return { data: lignes };
}

async function chargerAdminEsat(choix) {
  const p = S.profil;
  const ancien = S.d || {};
  const now = new Date();
  const annee = choix && choix.annee != null ? choix.annee : (ancien.annee != null ? ancien.annee : now.getFullYear());
  const mois = choix && choix.mois != null ? choix.mois : (ancien.mois != null ? ancien.mois : now.getMonth());
  const debut = isoJour(annee, mois, 1);
  const fin = isoJour(annee, mois, nbJours(annee, mois));

  const [e, at, st, tr, va, cl, fe] = await Promise.all([
    sb.from('esats').select('nom').eq('id', p.esat_id).maybeSingle(),
    sb.from('ateliers').select('id, nom').eq('esat_id', p.esat_id).order('nom'),
    sb.from('statuts').select('id, code, nom, couleur, ordre, esat_id').order('ordre').order('code'),
    sb.from('travailleurs').select('*').order('prenom'),
    sb.from('journees_validees').select('atelier_id, jour').gte('jour', debut).lte('jour', fin),
    sb.from('mois_clotures').select('mois').eq('mois', debut).maybeSingle(),
    sb.from('jours_fermes').select('jour, motif').gte('jour', debut).lte('jour', fin)
  ]);
  const pr = await toutLire(() => sb.from('presences').select('id, travailleur_id, jour, statut_id')
    .gte('jour', debut).lte('jour', fin).order('id'));
  const ko = [e, at, st, tr, va, pr].find((r) => r.error);
  if (ko) return vueMessage('Chargement impossible', ko.error.message);

  const pres = {};
  pr.data.forEach((r) => { pres[r.travailleur_id + '|' + r.jour] = r.statut_id; });
  const valid = {};
  va.data.forEach((r) => { valid[r.atelier_id + '|' + r.jour] = true; });

  S.d = {
    annee, mois, atelierId: ancien.atelierId || 'tous',
    esat: e.data ? e.data.nom : '', ateliers: at.data, statuts: st.data, travailleurs: tr.data, pres, valid,
    cloture: !!(cl && !cl.error && cl.data),
    fermes: mapFermes(fe && !fe.error ? fe.data : [], [annee])
  };
  vueAdminEsat();
}

function celluleCsv(v) {
  let t = String(v == null ? '' : v);
  if (/^[=+\-@]/.test(t)) t = '’' + t; // évite qu'Excel exécute une formule
  return '"' + t.replace(/"/g, '""') + '"';
}

function telecharger(nomFichier, lignes) {
  const csv = '﻿' + lignes.map((l) => l.map(celluleCsv).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = h('a', { href: url, download: nomFichier });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------------
// EXPORT EXCEL (.xlsx) mis en forme : titre, dates, couleurs des statuts, totaux, légende
// ---------------------------------------------------------------------
function chargerExcelJS() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  return new Promise((resolve, reject) => {
    const sc = document.createElement('script');
    sc.src = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
    sc.onload = () => (window.ExcelJS ? resolve(window.ExcelJS) : reject(new Error('ExcelJS indisponible')));
    sc.onerror = () => reject(new Error('Chargement impossible : vérifiez votre connexion internet.'));
    document.head.append(sc);
  });
}

function lettreColonne(n) { // 1 -> A, 27 -> AA
  let s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
const argb = (hex) => 'FF' + String(hex).replace('#', '').toUpperCase();
const critere = (t) => String(t).replace(/[~*?]/g, '~$&').replace(/"/g, '""'); // pour COUNTIF

function dimensionsImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.width || 3, h: img.height || 1 });
    img.onerror = () => resolve({ w: 3, h: 1 });
    img.src = url;
  });
}

async function construireClasseur(o) {
  const ExcelJS = await chargerExcelJS();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Atelio';
  wb.created = new Date();

  const n = o.info.length;
  const PREM_JOUR = 4;                       // colonne D
  const DERN_JOUR = PREM_JOUR + n - 1;
  const PREM_TOT = DERN_JOUR + 1;
  const nbTot = o.colsTot.length + 1;        // + « Non saisi »
  const DERN = PREM_TOT + nbTot - 1;
  const L = lettreColonne;
  const fin = { style: 'thin', color: { argb: 'FFD9D9DE' } };
  const bordure = { top: fin, left: fin, bottom: fin, right: fin };
  const ENCRE = 'FF17191C', GRIS = 'FF5B5F6A';
  const MARQUE = couleurMarque() ? argb(couleurMarque()) : ENCRE;
  const mois = libelleMois(o.annee, o.mois);
  const jourSemaine = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

  const ws = wb.addWorksheet('Présences', {
    views: [{ state: 'frozen', xSplit: 3, ySplit: 5 }],
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 }, printTitlesRow: '4:5' },
    headerFooter: { oddFooter: '&LAtelio&CPage &P sur &N&R' + mois }
  });

  // Titre
  ws.mergeCells(1, 1, 1, Math.min(DERN, 16));
  ws.getCell(1, 1).value = o.esat + ' · Présences · ' + mois;
  ws.getCell(1, 1).font = { size: 16, bold: true, color: { argb: ENCRE } };
  ws.getRow(1).height = 26;
  ws.mergeCells(2, 1, 2, Math.min(DERN, 16));
  ws.getCell(2, 1).value = o.vue + ' · édité le ' + new Date().toLocaleDateString('fr-FR');
  ws.getCell(2, 1).font = { size: 11, color: { argb: GRIS } };

  // Logo de l'ESAT (en haut, à droite du titre)
  const logoExcel = S.marque ? logoSur(S.marque.logo) : '';
  if (logoExcel) {
    try {
      const dim = await dimensionsImage(logoExcel);
      const idImg = wb.addImage({ base64: logoExcel, extension: logoExcel.startsWith('data:image/png') ? 'png' : 'jpeg' });
      const haut = 46;
      ws.addImage(idImg, { tl: { col: 7, row: 0.1 }, ext: { width: Math.round(haut * dim.w / dim.h), height: haut } });
    } catch (e) { /* l'export fonctionne aussi sans logo */ }
  }

  // En-têtes (2 lignes : jour de la semaine, puis date)
  const entete = (cell, texte, fond) => {
    cell.value = texte;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fond || MARQUE } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = bordure;
  };
  ['Atelier', 'Nom', 'Prénom'].forEach((t, i) => {
    ws.mergeCells(4, i + 1, 5, i + 1);
    entete(ws.getCell(4, i + 1), t);
    ws.getCell(4, i + 1).alignment = { horizontal: 'left', vertical: 'middle' };
    ws.getCell(5, i + 1).border = bordure;
  });
  o.info.forEach((x, i) => {
    const c = PREM_JOUR + i;
    const fond = x.we ? GRIS : MARQUE;
    entete(ws.getCell(4, c), jourSemaine[new Date(o.annee, o.mois, x.j).getDay()], fond);
    entete(ws.getCell(5, c), new Date(Date.UTC(o.annee, o.mois, x.j)), fond);
    ws.getCell(5, c).numFmt = 'dd/mm';
  });
  const libellesTot = o.colsTot.map((c) => c.label).concat(['Non saisi']);
  libellesTot.forEach((t, i) => {
    ws.mergeCells(4, PREM_TOT + i, 5, PREM_TOT + i);
    entete(ws.getCell(4, PREM_TOT + i), t, i === 0 ? 'FF2F7B3A' : MARQUE);
    ws.getCell(5, PREM_TOT + i).border = bordure;
  });

  // Largeurs
  ws.getColumn(1).width = 18; ws.getColumn(2).width = 18; ws.getColumn(3).width = 16;
  for (let c = PREM_JOUR; c <= DERN_JOUR; c++) ws.getColumn(c).width = 11;
  for (let c = PREM_TOT; c <= DERN; c++) ws.getColumn(c).width = 13;
  ws.getRow(5).height = 20;

  // Colonnes de totaux : formules qui comptent les statuts de la ligne (restent justes si on corrige à la main)
  const parId = Object.fromEntries(o.statuts.map((s) => [s.id, s]));
  const idxAbs0 = 1;                         // 0 = Présent, 1 = Total absences, 2.. = motifs
  const formuleTot = (i, r, valeur) => {
    const col = o.colsTot[i];
    const plage = L(PREM_JOUR) + r + ':' + L(DERN_JOUR) + r;
    if (i === 0 || i >= 2) {
      const s = parId[col.ids[0]];
      if (!s) return valeur;
      return { formula: 'COUNTIF(' + plage + ',"' + critere(s.nom) + '")', result: valeur };
    }
    if (o.colsTot.length > 2) return { formula: 'SUM(' + L(PREM_TOT + 2) + r + ':' + L(PREM_TOT + o.colsTot.length - 1) + r + ')', result: valeur };
    return valeur;
  };

  const styleTot = (cell) => { cell.alignment = { horizontal: 'center', vertical: 'middle' }; cell.border = bordure; cell.font = { bold: true, size: 11 }; };

  let r = 6;
  o.lignes.forEach((l) => {
    ws.getCell(r, 1).value = l.atelier;
    ws.getCell(r, 2).value = l.nom;
    ws.getCell(r, 3).value = l.prenom;
    [1, 2, 3].forEach((c) => { ws.getCell(r, c).border = bordure; ws.getCell(r, c).alignment = { vertical: 'middle' }; });
    ws.getCell(r, 2).font = { bold: true };
    l.cells.forEach(({ x, s, off }, i) => {
      const cell = ws.getCell(r, PREM_JOUR + i);
      cell.border = bordure;
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      if (s) {
        cell.value = s.nom;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(couleurSure(s.couleur)) } };
        cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, size: 9 };
      } else if (x.we || off) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDEDF0' } };
      } else if (x.j <= o.jusqua) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFBE1D1' } }; // jour ouvré passé sans saisie
      }
    });
    o.colsTot.forEach((col, i) => {
      const cell = ws.getCell(r, PREM_TOT + i);
      cell.value = formuleTot(i, r, o.somme(col, l.cpt));
      styleTot(cell);
    });
    ws.getCell(r, DERN).value = l.manque;
    styleTot(ws.getCell(r, DERN));
    ws.getRow(r).height = 24;
    r++;
  });
  const dernLigne = r - 1;

  // Ligne de total
  if (o.lignes.length) {
    ws.mergeCells(r, 1, r, 3);
    ws.getCell(r, 1).value = o.libelleTotal;
    const totCpt = {}; let totManque = 0;
    o.lignes.forEach((l) => { Object.keys(l.cpt).forEach((k) => { totCpt[k] = (totCpt[k] || 0) + l.cpt[k]; }); totManque += l.manque; });
    o.info.forEach((x, i) => {
      const saisis = o.lignes.filter((l) => l.cells[i].s).length;
      const presents = o.lignes.filter((l) => l.cells[i].s && l.cells[i].s.id === o.idPresent).length;
      const cell = ws.getCell(r, PREM_JOUR + i);
      cell.value = saisis === 0 ? '' : presents + ' sur ' + o.lignes.length;
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.font = { size: 9, bold: true };
    });
    o.colsTot.forEach((col, i) => {
      const c = ws.getCell(r, PREM_TOT + i);
      c.value = { formula: 'SUM(' + L(PREM_TOT + i) + '6:' + L(PREM_TOT + i) + dernLigne + ')', result: o.somme(col, totCpt) };
    });
    ws.getCell(r, DERN).value = { formula: 'SUM(' + L(DERN) + '6:' + L(DERN) + dernLigne + ')', result: totManque };
    for (let c = 1; c <= DERN; c++) {
      const cell = ws.getCell(r, c);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9E9EC' } };
      cell.border = bordure;
      if (c <= 3 || c >= PREM_TOT) cell.font = { bold: true, size: 11 };
      if (c >= PREM_TOT) cell.alignment = { horizontal: 'center', vertical: 'middle' };
    }
    ws.getRow(r).height = 26;
    ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: DERN } };
  }

  // Feuille « Synthèse par atelier » (vue de tous les ateliers)
  if (o.synthese && o.synthese.length) {
    const sy = wb.addWorksheet('Synthèse par atelier', { views: [{ state: 'frozen', ySplit: 3 }], pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    sy.mergeCells(1, 1, 1, 2 + libellesTot.length);
    sy.getCell(1, 1).value = o.esat + ' · Synthèse par atelier · ' + mois;
    sy.getCell(1, 1).font = { size: 16, bold: true };
    sy.getRow(1).height = 26;
    const ent = ['Atelier', 'Effectif'].concat(libellesTot);
    ent.forEach((t, i) => { entete(sy.getCell(3, i + 1), t, i >= 2 && i === 2 ? 'FF2F7B3A' : MARQUE); });
    sy.getColumn(1).width = 26; sy.getColumn(2).width = 12;
    for (let i = 0; i < libellesTot.length; i++) sy.getColumn(3 + i).width = 15;
    const totSy = { eff: 0, cpt: {}, manque: 0 };
    o.synthese.forEach((a, k) => {
      const rr = 4 + k;
      sy.getCell(rr, 1).value = a.atelier; sy.getCell(rr, 1).font = { bold: true };
      sy.getCell(rr, 2).value = a.effectif;
      o.colsTot.forEach((col, i) => { sy.getCell(rr, 3 + i).value = o.somme(col, a.cpt); });
      sy.getCell(rr, 3 + o.colsTot.length).value = a.manque;
      for (let c = 1; c <= 2 + libellesTot.length; c++) { sy.getCell(rr, c).border = bordure; if (c > 1) sy.getCell(rr, c).alignment = { horizontal: 'center' }; }
      totSy.eff += a.effectif; totSy.manque += a.manque;
      Object.keys(a.cpt).forEach((q) => { totSy.cpt[q] = (totSy.cpt[q] || 0) + a.cpt[q]; });
    });
    const rt = 4 + o.synthese.length;
    sy.getCell(rt, 1).value = 'Total ESAT';
    sy.getCell(rt, 2).value = { formula: 'SUM(B4:B' + (rt - 1) + ')', result: totSy.eff };
    for (let i = 0; i < libellesTot.length; i++) {
      const res = i < o.colsTot.length ? o.somme(o.colsTot[i], totSy.cpt) : totSy.manque;
      sy.getCell(rt, 3 + i).value = { formula: 'SUM(' + L(3 + i) + '4:' + L(3 + i) + (rt - 1) + ')', result: res };
    }
    for (let c = 1; c <= 2 + libellesTot.length; c++) {
      const cell = sy.getCell(rt, c);
      cell.font = { bold: true }; cell.border = bordure; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9E9EC' } };
      if (c > 1) cell.alignment = { horizontal: 'center' };
    }
  }

  // Feuille « Légende »
  const lg = wb.addWorksheet('Légende');
  lg.getColumn(1).width = 10; lg.getColumn(2).width = 28; lg.getColumn(3).width = 70;
  lg.getCell(1, 1).value = 'Légende'; lg.getCell(1, 1).font = { size: 16, bold: true };
  ['Code', 'Statut'].forEach((t, i) => entete(lg.getCell(3, i + 1), t));
  o.statuts.forEach((s, k) => {
    const rr = 4 + k;
    lg.getCell(rr, 1).value = s.code;
    lg.getCell(rr, 2).value = s.nom;
    lg.getCell(rr, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(couleurSure(s.couleur)) } };
    lg.getCell(rr, 1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    lg.getCell(rr, 1).alignment = { horizontal: 'center' };
    lg.getCell(rr, 1).border = bordure; lg.getCell(rr, 2).border = bordure;
  });
  const notes = [
    'Case colorée : statut saisi par le moniteur ce jour-là.',
    'Case rosée : jour ouvré passé sans statut saisi (compté dans « Non saisi »).',
    'Case grise : week-end.',
    '« Non saisi » compte les jours du lundi au vendredi sans statut, jours fériés compris.',
    '« Total absences » additionne tous les motifs d’absence, détaillés dans les colonnes qui suivent.',
    '« Non précisé » : absence sans motif détaillé.',
    'Les totaux par ligne se recalculent si vous corrigez une case à la main (la colonne « Non saisi » est fixe).'
  ];
  notes.forEach((t, k) => { lg.getCell(5 + o.statuts.length + k, 1).value = t; lg.getCell(5 + o.statuts.length + k, 1).font = { color: { argb: GRIS } }; });
  return wb;
}

async function exporterExcel(o) {
  try {
    const wb = await construireClasseur(o);
    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = h('a', { href: url, download: o.nomFichier });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (e) {
    window.alert('Export impossible : ' + (e && e.message ? e.message : e));
  }
}

function vueAdminEsat() {
  const d = S.d;
  const n = nbJours(d.annee, d.mois);
  const now = new Date();
  const idP = (d.statuts.find((s) => s.code === 'P' && !s.esat_id) || {}).id;
  const parId = Object.fromEntries(d.statuts.map((s) => [s.id, s]));
  if (d.atelierId !== 'tous' && !d.ateliers.some((a) => a.id === d.atelierId)) d.atelierId = 'tous';

  const info = Array.from({ length: n }, (_, i) => {
    const j = i + 1;
    const g = new Date(d.annee, d.mois, j).getDay();
    const iso = isoJour(d.annee, d.mois, j);
    const ferie = (d.fermes && d.fermes[iso]) || '';
    return { j, iso, lettre: JOURS_LETTRES[g], we: g === 0 || g === 6 || !!ferie, ferie };
  });

  // Jusqu'à quel jour compte-t-on les "non saisis" ? (hors aujourd'hui, qui est en cours)
  let jusqua = 0;
  if (d.annee === now.getFullYear() && d.mois === now.getMonth()) jusqua = now.getDate() - 1;
  else if (d.annee < now.getFullYear() || (d.annee === now.getFullYear() && d.mois < now.getMonth())) jusqua = n;

  const gens = d.travailleurs.filter((w) => w.actif || info.some((x) => d.pres[w.id + '|' + x.iso]))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || a.prenom.localeCompare(b.prenom, 'fr'));
  const details = gens.map((w) => {
    const cpt = {};
    let manque = 0;
    const cells = info.map((x) => {
      const sid = d.pres[w.id + '|' + x.iso];
      const s = sid ? parId[sid] : null;
      const cr = creneau(w, x.iso);
      const off = !s && !x.we && !cr;   // ne travaille pas ce jour-là (horaires)
      if (s) cpt[s.id] = (cpt[s.id] || 0) + 1;
      else if (!x.we && !off && x.j <= jusqua) manque++;
      return { x, s, off, cr };
    });
    return { w, cells, cpt, manque };
  });

  // Colonnes de totaux : Présent, total des absences, puis un motif par colonne.
  // Les motifs sont les statuts de l'ESAT (de base + ceux ajoutés pour lui par l'éditeur).
  const sA = d.statuts.find((s) => s.code === 'A' && !s.esat_id);
  const absences = d.statuts.filter((s) => s.id !== idP);
  const colsTot = [{ label: 'Présent', ids: [idP] }, { label: 'Total absences', ids: absences.map((s) => s.id) }]
    .concat(absences.map((s) => ({ label: (s === sA ? 'Non précisé' : s.nom), ids: [s.id] })));
  const somme = (c, cpt) => c.ids.reduce((tot, id) => tot + (cpt[id] || 0), 0);
  d.calc = { info, details, colsTot, somme };
  const entetesTotaux = colsTot.map((c) => h('th', { class: 'tot' }, c.label))
    .concat([h('th', { class: 'tot', title: 'Jours du lundi au vendredi sans statut saisi' }, 'Non saisi')]);
  const entetesJours = info.map((x) => h('th', { class: x.we ? 'we' : '', title: x.ferie || null }, h('div', {}, x.lettre), h('div', {}, String(x.j))));

  const cellulesJours = (l) => l.cells.map(({ x, s, off, cr }) => s
    ? h('td', { class: 'c' + (x.we ? ' we' : ''), title: cr === 'M' || cr === 'A' ? LIBELLE_CRENEAU[cr] : null },
        h('span', { class: 'pill', style: '--c:' + couleurSure(s.couleur) }, s.nom + (cr === 'M' ? ' · matin' : cr === 'A' ? ' · après-midi' : '')))
    : off
      ? h('td', { class: 'c vide we', title: 'Ne travaille pas ce jour (horaires)' }, '')
      : h('td', { class: 'c vide' + (x.we ? ' we' : ''), title: cr === 'M' || cr === 'A' ? LIBELLE_CRENEAU[cr] : null }, x.we ? '' : (cr === 'M' ? 'M' : cr === 'A' ? 'A' : '\u00b7')));
  const totauxLigne = (l) => [
    colsTot.map((c) => h('td', { class: 'tot' }, String(somme(c, l.cpt)))),
    h('td', { class: 'tot' }, String(l.manque))
  ];
  const nomFichier = (suffixe) => 'atelio-presences-' + d.annee + '-' + String(d.mois + 1).padStart(2, '0') + '-' + suffixe + '.xlsx';

  let tableau;
  let exportation = null;
  const vueAtelier = d.atelierId !== 'tous';

  if (d.ateliers.length === 0) {
    tableau = h('div', { class: 'card' }, h('p', {}, 'Aucun atelier pour l’instant. Créez-les dans l’onglet « Gérer l’ESAT ».'));
  } else if (vueAtelier) {
    // ----- Détail : un atelier, un travailleur par ligne
    const atelier = d.ateliers.find((a) => a.id === d.atelierId);
    const lignes = details.filter((l) => l.w.atelier_id === d.atelierId);
    const corps = lignes.map((l) => h('tr', {},
      h('td', { class: 's s1' }, l.w.nom),
      h('td', { class: 's s2 sl' }, l.w.prenom),
      cellulesJours(l),
      totauxLigne(l)
    ));
    tableau = h('div', { class: 'scroll' }, h('table', { class: 'cal' },
      h('caption', { class: 'sr' }, 'Présences de l’atelier ' + atelier.nom + ', ' + libelleMois(d.annee, d.mois)),
      h('thead', {}, h('tr', {}, h('th', { class: 's s1' }, 'Nom'), h('th', { class: 's s2 sl' }, 'Prénom'), entetesJours, entetesTotaux)),
      h('tbody', {}, corps.length ? corps : h('tr', {}, h('td', { class: 's s1', colspan: '2' }, 'Aucun travailleur dans cet atelier.')))));
    exportation = () => exporterExcel({
      d, esat: d.esat, annee: d.annee, mois: d.mois, info, colsTot, somme, statuts: d.statuts, jusqua, idPresent: idP,
      vue: 'Atelier : ' + atelier.nom, libelleTotal: 'Total atelier',
      nomFichier: nomFichier(atelier.nom.normalize('NFD').replace(/[^\w]+/g, '-').toLowerCase()),
      lignes: lignes.map((l) => ({ atelier: atelier.nom, nom: l.w.nom, prenom: l.w.prenom, cells: l.cells, cpt: l.cpt, manque: l.manque })),
      synthese: null
    });
  } else {
    // ----- Condensé : chaque atelier résumé, puis ses travailleurs en dessous
    const parAtelier = d.ateliers.map((a) => {
      const membres = details.filter((l) => l.w.atelier_id === a.id);
      const jours = info.map((x) => {
        const saisis = membres.filter((l) => d.pres[l.w.id + '|' + x.iso]).length;
        const presents = membres.filter((l) => idP && d.pres[l.w.id + '|' + x.iso] === idP).length;
        const attendus = membres.filter((l) => x.we || d.pres[l.w.id + '|' + x.iso] || creneau(l.w, x.iso)).length;
        return { x, saisis, presents, total: attendus, valide: !!d.valid[a.id + '|' + x.iso] };
      });
      const cpt = {};
      let manque = 0;
      membres.forEach((l) => {
        Object.keys(l.cpt).forEach((k) => { cpt[k] = (cpt[k] || 0) + l.cpt[k]; });
        manque += l.manque;
      });
      return { a, membres, jours, cpt, manque, total: membres.length };
    });
    const totalJours = info.map((x, i) => {
      const saisis = parAtelier.reduce((t, l) => t + l.jours[i].saisis, 0);
      const presents = parAtelier.reduce((t, l) => t + l.jours[i].presents, 0);
      const total = parAtelier.reduce((t, l) => t + l.jours[i].total, 0);
      const valide = parAtelier.filter((l) => l.total > 0).every((l) => l.jours[i].valide) && total > 0;
      return { x, saisis, presents, total, valide };
    });
    const totalCpt = {};
    let totalManque = 0;
    let totalEffectif = 0;
    parAtelier.forEach((l) => {
      Object.keys(l.cpt).forEach((k) => { totalCpt[k] = (totalCpt[k] || 0) + l.cpt[k]; });
      totalManque += l.manque;
      totalEffectif += l.total;
    });

    const cellule = (j) => {
      const etat = j.valide ? 'val' : (j.saisis > 0 ? 'part' : 'vide');
      const texte = j.total === 0 || (j.x.we && j.saisis === 0) ? '' : (j.saisis === 0 ? '·' : j.presents + '/' + j.total);
      return h('td', {
        class: 'c ' + etat + (j.x.we ? ' we' : ''),
        title: j.presents + ' présents sur ' + j.total + ', ' + j.saisis + ' renseignés' + (j.valide ? ', journée validée' : '')
      }, texte);
    };

    const lignesTable = [];
    parAtelier.forEach((l) => {
      lignesTable.push(h('tr', { class: 'resume' },
        h('td', { class: 's s1' }, h('button', {
          type: 'button', class: 'linkbtn', style: 'min-height:36px',
          'aria-label': 'Voir le détail de l’atelier ' + l.a.nom,
          onClick: () => { d.atelierId = l.a.id; vueAdminEsat(); }
        }, l.a.nom)),
        h('td', { class: 's s2' }, 'Effectif : ' + l.total),
        h('td', { class: 's s3 sl' }, ''),
        l.jours.map(cellule),
        totauxLigne(l)));
      l.membres.forEach((m) => lignesTable.push(h('tr', {},
        h('td', { class: 's s1 atl' }, l.a.nom),
        h('td', { class: 's s2' }, m.w.nom),
        h('td', { class: 's s3 sl' }, m.w.prenom),
        cellulesJours(m),
        totauxLigne(m))));
    });
    lignesTable.push(h('tr', { class: 'resume' },
      h('td', { class: 's s1' }, 'Total ESAT'),
      h('td', { class: 's s2' }, 'Effectif : ' + totalEffectif),
      h('td', { class: 's s3 sl' }, ''),
      totalJours.map(cellule),
      totauxLigne({ cpt: totalCpt, manque: totalManque })));

    tableau = h('div', { class: 'scroll' }, h('table', { class: 'cal' },
      h('caption', { class: 'sr' }, 'Présences de tous les ateliers et de leurs travailleurs, ' + libelleMois(d.annee, d.mois)),
      h('thead', {}, h('tr', {},
        h('th', { class: 's s1' }, 'Atelier'), h('th', { class: 's s2' }, 'Nom'), h('th', { class: 's s3 sl' }, 'Prénom'), entetesJours, entetesTotaux)),
      h('tbody', {}, lignesTable)));

    exportation = () => exporterExcel({
      d, esat: d.esat, annee: d.annee, mois: d.mois, info, colsTot, somme, statuts: d.statuts, jusqua, idPresent: idP,
      vue: 'Tous les ateliers', libelleTotal: 'Total ESAT',
      nomFichier: nomFichier('tous-les-ateliers'),
      lignes: parAtelier.flatMap((l) => l.membres.map((m) => ({ atelier: l.a.nom, nom: m.w.nom, prenom: m.w.prenom, cells: m.cells, cpt: m.cpt, manque: m.manque }))),
      synthese: parAtelier.map((l) => ({ atelier: l.a.nom, effectif: l.total, cpt: l.cpt, manque: l.manque }))
    });
  }

  const choixAtelier = h('select', {
    id: 'choixAtelier', class: 'in', style: 'max-width:340px',
    onChange: (e) => { d.atelierId = e.target.value; vueAdminEsat(); }
  }, h('option', { value: 'tous' }, 'Tous les ateliers (vue condensée)'),
    d.ateliers.map((a) => h('option', { value: a.id }, a.nom)));
  choixAtelier.value = d.atelierId;

  const decaler = (delta) => {
    const dt = new Date(d.annee, d.mois + delta, 1);
    chargerAdminEsat({ annee: dt.getFullYear(), mois: dt.getMonth() });
  };

  const legende = h('div', { class: 'card stack' },
    h('h3', {}, 'Légende'),
    h('div', { class: 'chips' }, d.statuts.map(pastille)),
    h('p', { class: 'muted' }, vueAtelier
      ? 'Un point = aucun statut saisi ce jour-là. « Non saisi » compte les jours du lundi au vendredi sans statut, jours fériés compris. « Total absences » additionne tous les motifs d’absence, détaillés dans les colonnes qui suivent. Les jours fermés (fériés, fermetures) sont grisés comme les week-ends et ne comptent pas dans « Non saisi ».'
      : 'Les lignes grisées résument chaque atelier (présents sur effectif ; bordure verte = journée validée par le moniteur ; fond gris = saisie en cours ; point = rien saisi). En dessous, chaque travailleur avec son statut du jour. « Non saisi » compte les jours du lundi au vendredi sans statut, jours fériés compris. « Total absences » additionne tous les motifs d’absence, détaillés dans les colonnes qui suivent.'));

  render(pageAvec([
    navAdminEsat('tableau'),
    h('div', { class: 'stack', style: 'gap:6px' },
      h('p', { class: 'muted' }, d.esat),
      h('h1', {}, 'Tableau de bord des ', h('em', {}, 'présences'))),
    h('div', { class: 'row' },
      h('div', { class: 'row', style: 'justify-content:flex-start' },
        h('button', { type: 'button', class: 'secondary', 'aria-label': 'Mois précédent', onClick: () => decaler(-1) }, '‹ Précédent'),
        h('h2', { style: 'min-width:170px;text-align:center', 'aria-live': 'polite' }, libelleMois(d.annee, d.mois)),
        h('button', { type: 'button', class: 'secondary', 'aria-label': 'Mois suivant', onClick: () => decaler(1) }, 'Suivant ›'),
        d.cloture ? h('span', { class: 'tag verr', title: 'Les présences de ce mois ne sont plus modifiables' }, '🔒 Mois clôturé') : null),
      h('div', { class: 'row', style: 'justify-content:flex-end' },
        h('div', {}, h('label', { class: 'lbl', for: 'choixAtelier' }, 'Atelier'), choixAtelier),
        exportation ? h('button', { type: 'button', class: 'secondary', style: 'align-self:flex-end', onClick: exportation }, 'Exporter (Excel)') : null,
        d.ateliers.length ? h('button', {
          type: 'button', class: 'secondary', style: 'align-self:flex-end',
          onClick: () => { d.fAtelier = d.atelierId; d.fTrav = 'tous'; vueFiches(); }
        }, 'Fiches mensuelles (PDF)') : null)),
    tableau,
    legende
  ], true));
}

// ---------------------------------------------------------------------
// FICHES MENSUELLES : une page par travailleur, à imprimer ou enregistrer en PDF
// ---------------------------------------------------------------------
const JOURS_COURTS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

function ficheTravailleur(d, l, nomAtelier, jusqua) {
  const c = d.calc;
  const moitie = Math.ceil(c.info.length / 2);
  const ligne = ({ x, s, off }) => {
    const jour = JOURS_COURTS[new Date(d.annee, d.mois, x.j).getDay()];
    let contenu;
    if (s) contenu = [h('span', { class: 'pt', style: '--c:' + couleurSure(s.couleur) }), s.nom];
    else if (x.we) contenu = h('span', { class: 'vide' }, x.ferie || 'Week-end');
    else if (off) contenu = h('span', { class: 'vide' }, 'Ne travaille pas');
    else if (x.j <= jusqua) contenu = h('span', { class: 'vide' }, 'Non saisi');
    else contenu = '';
    return h('tr', { class: x.we || off ? 'we' : '' }, h('td', {}, jour + ' ' + x.j), h('td', {}, contenu));
  };
  const tableJours = (cells) => h('table', { class: 'tbl' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Jour'), h('th', {}, 'Statut'))),
    h('tbody', {}, cells.map(ligne)));
  const resume = c.colsTot.map((col, i) => ({ label: col.label, n: c.somme(col, l.cpt), cle: i }))
    .filter((r) => r.cle < 2 || r.n > 0)
    .concat([{ label: 'Non saisi', n: l.manque }]);

  const logo = S.marque ? logoSur(S.marque.logo) : '';
  return h('section', { class: 'fiche', 'aria-label': 'Fiche de ' + l.w.prenom + ' ' + l.w.nom, style: couleurMarque() ? '--marque:' + couleurMarque() : null },
    h('div', { class: 'fiche-tete' },
      logo ? h('img', { class: 'fiche-logo', src: logo, alt: '' }) : null,
      h('div', { class: 'stack', style: 'gap:4px' },
        h('p', { class: 'muted' }, d.esat),
        h('h2', {}, 'Fiche de présence · ' + libelleMois(d.annee, d.mois)))),
    h('div', { class: 'fiche-id' },
      h('p', {}, h('strong', {}, 'Nom : '), l.w.nom),
      h('p', {}, h('strong', {}, 'Prénom : '), l.w.prenom),
      h('p', {}, h('strong', {}, 'Atelier : '), nomAtelier)),
    h('div', { class: 'fiche-jours-wrap' },
      tableJours(c.info.slice(0, moitie).map((x, i) => l.cells[i])),
      tableJours(c.info.slice(moitie).map((x, i) => l.cells[moitie + i]))),
    h('table', { class: 'tbl fiche-resume' },
      h('caption', { style: 'text-align:left;font-weight:700;padding:4px 0' }, 'Récapitulatif du mois'),
      h('tbody', {}, resume.map((r) => h('tr', {}, h('td', {}, r.label), h('td', { style: 'text-align:right;font-weight:700' }, r.n + (r.n > 1 ? ' jours' : ' jour')))))),
    h('div', { class: 'sign' },
      h('div', {}, 'Visa du moniteur'),
      h('div', {}, 'Visa de la direction')),
    h('p', { class: 'muted', style: 'font-size:13px' }, 'Édité le ' + new Date().toLocaleDateString('fr-FR') + ' avec Atelio. Document confidentiel : il contient des données de présence.'));
}

function vueFiches() {
  const d = S.d;
  const c = d.calc;
  const now = new Date();
  let jusqua = 0;
  if (d.annee === now.getFullYear() && d.mois === now.getMonth()) jusqua = now.getDate() - 1;
  else if (d.annee < now.getFullYear() || (d.annee === now.getFullYear() && d.mois < now.getMonth())) jusqua = c.info.length;

  if (d.fAtelier !== 'tous' && !d.ateliers.some((a) => a.id === d.fAtelier)) d.fAtelier = 'tous';
  const liste = c.details.filter((l) => d.fAtelier === 'tous' || l.w.atelier_id === d.fAtelier);
  if (d.fTrav !== 'tous' && !liste.some((l) => l.w.id === d.fTrav)) d.fTrav = 'tous';
  const choisis = d.fTrav === 'tous' ? liste : liste.filter((l) => l.w.id === d.fTrav);
  const nomAtelier = (id) => (d.ateliers.find((a) => a.id === id) || {}).nom || '';

  const selA = h('select', { id: 'fAtelier', class: 'in', style: 'max-width:300px', onChange: (e) => { d.fAtelier = e.target.value; d.fTrav = 'tous'; vueFiches(); } },
    h('option', { value: 'tous' }, 'Tous les ateliers'), d.ateliers.map((a) => h('option', { value: a.id }, a.nom)));
  selA.value = d.fAtelier;
  const selT = h('select', { id: 'fTrav', class: 'in', style: 'max-width:300px', onChange: (e) => { d.fTrav = e.target.value; vueFiches(); } },
    h('option', { value: 'tous' }, 'Tous les travailleurs'), liste.map((l) => h('option', { value: l.w.id }, l.w.nom + ' ' + l.w.prenom)));
  selT.value = d.fTrav;

  render(pageAvec([
    h('div', { class: 'noprint stack' },
      h('div', { class: 'stack', style: 'gap:6px' },
        h('p', { class: 'muted' }, d.esat),
        h('h1', {}, 'Fiches mensuelles · ' + libelleMois(d.annee, d.mois))),
      h('p', { class: 'muted' }, 'Une page par travailleur. Cliquez sur « Imprimer ou enregistrer en PDF » : dans la fenêtre qui s’ouvre, choisissez votre imprimante, ou « Enregistrer au format PDF ». Pour changer de mois, revenez au tableau de bord.'),
      h('div', { class: 'row', style: 'justify-content:flex-start;align-items:flex-end' },
        h('div', {}, h('label', { class: 'lbl', for: 'fAtelier' }, 'Atelier'), selA),
        h('div', {}, h('label', { class: 'lbl', for: 'fTrav' }, 'Travailleur'), selT)),
      h('div', { class: 'row', style: 'justify-content:flex-start' },
        h('button', { type: 'button', class: 'primary', disabled: choisis.length === 0, onClick: () => window.print() },
          'Imprimer ou enregistrer en PDF' + (choisis.length > 1 ? ' (' + choisis.length + ' fiches)' : '')),
        h('button', { type: 'button', class: 'secondary', onClick: () => vueAdminEsat() }, '‹ Retour au tableau de bord'))),
    choisis.length === 0
      ? h('p', { class: 'noprint' }, 'Aucun travailleur à afficher pour ce choix.')
      : h('div', { class: 'fiches' }, choisis.map((l) => ficheTravailleur(d, l, nomAtelier(l.w.atelier_id), jusqua)))
  ], false));
}

// ---------------------------------------------------------------------
// GÉRER L'ESAT (administrateur) : ateliers, travailleurs, import Excel
// ---------------------------------------------------------------------
const norm = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const parNomPrenom = (a, b) => a.nom.localeCompare(b.nom, 'fr') || a.prenom.localeCompare(b.prenom, 'fr');

const navAdminEsat = (actif) => navPrincipale(actif);

// Écran « Statuts et motifs » de l'administrateur d'ESAT
async function chargerStatutsEsat(garder) {
  const eid = S.profil.esat_id;
  const [e, st] = await Promise.all([
    sb.from('esats').select('nom').eq('id', eid).maybeSingle(),
    sb.from('statuts').select('id, esat_id, code, nom, couleur, ordre').order('ordre').order('code')
  ]);
  const ko = [e, st].find((r) => r.error);
  if (ko) return vueMessage('Chargement impossible', ko.error.message);
  const ancien = garder && S.t ? S.t : {};
  S.t = { esatId: eid, esat: e.data ? e.data.nom : '', statuts: st.data, couleur: ancien.couleur || COULEURS[0].hex, msgStatut: '', errStatut: '' };
  vueStatutsEsat();
}

function vueStatutsEsat() {
  render(pageAvec([
    navAdminEsat('statuts'),
    h('div', { class: 'stack', style: 'gap:6px' },
      h('p', { class: 'muted' }, S.t.esat),
      h('h1', {}, 'Statuts et ', h('em', {}, 'motifs'))),
    blocStatuts(CTX_T)
  ], false));
}

async function chargerGestion(garder, esatId) {
  const eid = esatId || (garder && S.g ? S.g.esatId : null) || S.profil.esat_id;
  const [e, at, pf] = await Promise.all([
    sb.from('esats').select('nom').eq('id', eid).maybeSingle(),
    sb.from('ateliers').select('id, nom').eq('esat_id', eid).order('nom'),
    sb.from('profils').select('id, email, role, atelier_id, actif').eq('esat_id', eid).order('email')
  ]);
  const tr = await toutLire(() => sb.from('travailleurs').select('*').eq('esat_id', eid).order('nom').order('id'));
  const ko = [e, at, pf, tr].find((r) => r.error);
  if (ko) return vueMessage('Chargement impossible', ko.error.message);
  const ancien = garder ? (S.g || {}) : {};
  S.g = {
    esatId: eid, esat: e.data ? e.data.nom : '', ateliers: at.data, comptes: pf.data, identifiants: null, travailleurs: tr.data,
    filtre: ancien.filtre || 'tous', inactifs: !!ancien.inactifs,
    msg: '', err: '', import: ancien.import || null, occupe: false
  };
  vueGestion();
}

// Exécute une modification, recharge les données, puis affiche un message.
async function gestion(action, messageOk) {
  const { error } = await action();
  if (error) { S.g.err = 'Impossible : ' + error.message; S.g.msg = ''; return vueGestion(); }
  await chargerGestion(true);
  S.g.msg = messageOk;
  vueGestion();
}

function refuser(texte) { S.g.err = texte; S.g.msg = ''; vueGestion(); }

function ajouterAtelier(input) {
  const g = S.g;
  const nom = input.value.trim().slice(0, 100);
  if (!nom) return refuser('Renseignez le nom de l’atelier.');
  if (g.ateliers.some((a) => norm(a.nom) === norm(nom))) return refuser('Un atelier porte déjà ce nom.');
  return gestion(() => sb.from('ateliers').insert({ esat_id: S.g.esatId, nom }), 'Atelier « ' + nom + ' » ajouté.');
}

function renommerAtelier(atelier, valeur) {
  const g = S.g;
  const nom = valeur.trim().slice(0, 100);
  if (!nom) return refuser('Le nom de l’atelier ne peut pas être vide.');
  if (g.ateliers.some((a) => a.id !== atelier.id && norm(a.nom) === norm(nom))) return refuser('Un autre atelier porte déjà ce nom.');
  return gestion(() => sb.from('ateliers').update({ nom }).eq('id', atelier.id), 'Atelier renommé en « ' + nom + ' ».');
}

const GH = () => (S.gh = S.gh || { nv: HORAIRES_DEFAUT, ed: null, val: HORAIRES_DEFAUT });

function enregistrerHoraires(w) {
  const gh = GH(); const v = gh.val;
  gh.ed = null;
  return gestion(() => sb.from('travailleurs').update({ horaires: v === HORAIRES_DEFAUT ? null : v }).eq('id', w.id),
    'Horaires de ' + w.prenom + ' ' + w.nom + ' enregistrés.');
}

function ajouterTravailleur(nomIn, prenomIn, atelierSel) {
  const g = S.g;
  const nom = nomIn.value.trim().slice(0, 100);
  const prenom = prenomIn.value.trim().slice(0, 100);
  const atelierId = atelierSel.value;
  if (!g.ateliers.length) return refuser('Créez d’abord un atelier.');
  if (!nom || !prenom) return refuser('Renseignez le nom et le prénom.');
  if (g.travailleurs.some((w) => w.atelier_id === atelierId && norm(w.nom) === norm(nom) && norm(w.prenom) === norm(prenom))) {
    return refuser('Cette personne existe déjà dans cet atelier.');
  }
  const hr = GH().nv;
  const ligne = { esat_id: S.g.esatId, atelier_id: atelierId, nom, prenom };
  if (hr !== HORAIRES_DEFAUT) ligne.horaires = hr;
  GH().nv = HORAIRES_DEFAUT;
  return gestion(() => sb.from('travailleurs').insert(ligne), nom + ' ' + prenom + ' ajouté(e).');
}

function changerAtelier(w, atelierId) {
  if (atelierId === w.atelier_id) return null;
  return gestion(() => sb.from('travailleurs').update({ atelier_id: atelierId }).eq('id', w.id), w.nom + ' ' + w.prenom + ' a changé d’atelier.');
}

function basculerActif(w) {
  return gestion(() => sb.from('travailleurs').update({ actif: !w.actif }).eq('id', w.id),
    w.nom + ' ' + w.prenom + (w.actif ? ' est désactivé(e) : n’apparaît plus dans les saisies.' : ' est réactivé(e).'));
}

// --- Import d'une liste (Excel ou CSV) ---------------------------------
function lignesDepuisFeuille(aoa) {
  let debut = -1, cA = -1, cN = -1, cP = -1;
  for (let i = 0; i < Math.min(aoa.length, 10); i++) {
    const cellules = (aoa[i] || []).map(norm);
    const a = cellules.indexOf('atelier'), n = cellules.indexOf('nom'), pr = cellules.indexOf('prenom');
    if (a >= 0 && n >= 0 && pr >= 0) { debut = i; cA = a; cN = n; cP = pr; break; }
  }
  if (debut < 0) return { error: 'Colonnes introuvables : la première ligne du fichier doit contenir « Atelier », « Nom » et « Prénom ».' };
  const lignes = [];
  for (let i = debut + 1; i < aoa.length; i++) {
    const r = aoa[i] || [];
    const val = (c) => String(r[c] == null ? '' : r[c]).trim().slice(0, 100);
    const l = { atelier: val(cA), nom: val(cN), prenom: val(cP) };
    if (l.atelier || l.nom || l.prenom) lignes.push(l);
  }
  return { lignes };
}

function analyserImport(lignes, g) {
  const nomsAteliers = new Set(g.ateliers.map((a) => norm(a.nom)));
  const parId = Object.fromEntries(g.ateliers.map((a) => [a.id, norm(a.nom)]));
  const vus = new Set(g.travailleurs.map((w) => parId[w.atelier_id] + '|' + norm(w.nom) + '|' + norm(w.prenom)));
  return lignes.map((l) => {
    if (!l.atelier || !l.nom || !l.prenom) return { ...l, etat: 'incomplet' };
    const k = norm(l.atelier) + '|' + norm(l.nom) + '|' + norm(l.prenom);
    if (vus.has(k)) return { ...l, etat: 'doublon' };
    vus.add(k);
    return { ...l, etat: 'nouveau', nouvelAtelier: !nomsAteliers.has(norm(l.atelier)) };
  });
}

async function lireFichier(fichier) {
  const g = S.g;
  if (!fichier) return;
  if (typeof XLSX === 'undefined') return refuser('Le lecteur de fichiers n’a pas pu se charger : rechargez la page.');
  if (fichier.size > 5 * 1024 * 1024) return refuser('Fichier trop volumineux (5 Mo maximum).');
  try {
    const buf = await fichier.arrayBuffer();
    let wb;
    if (/\.(csv|txt)$/i.test(fichier.name)) {
      // Les CSV d'Excel France sont souvent en Windows-1252 (accents) : on essaie UTF-8, sinon Windows-1252.
      let texte;
      try { texte = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { texte = new TextDecoder('windows-1252').decode(buf); }
      wb = XLSX.read(texte, { type: 'string' });
    } else {
      wb = XLSX.read(buf, { type: 'array' });
    }
    const feuille = wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json(feuille, { header: 1, defval: '', raw: false });
    const r = lignesDepuisFeuille(aoa);
    if (r.error) return refuser(r.error);
    if (r.lignes.length > 2000) return refuser('Trop de lignes (2000 maximum par import).');
    g.import = { fichier: fichier.name, lignes: analyserImport(r.lignes, g) };
    g.err = ''; g.msg = '';
    vueGestion();
  } catch (e) {
    refuser('Ce fichier n’a pas pu être lu. Utilisez un fichier Excel (.xlsx) ou CSV.');
  }
}

async function confirmerImport() {
  const g = S.g;
  const p = { esat_id: g.esatId };
  const aImporter = g.import.lignes.filter((l) => l.etat === 'nouveau');
  if (!aImporter.length || g.occupe) return;
  g.occupe = true;
  vueGestion();
  const ids = new Map(g.ateliers.map((a) => [norm(a.nom), a.id]));
  const nouveaux = [];
  aImporter.forEach((l) => {
    if (!ids.has(norm(l.atelier)) && !nouveaux.some((n) => norm(n) === norm(l.atelier))) nouveaux.push(l.atelier);
  });
  if (nouveaux.length) {
    const { data, error } = await sb.from('ateliers').insert(nouveaux.map((nom) => ({ esat_id: p.esat_id, nom }))).select('id, nom');
    if (error) { g.occupe = false; return refuser('Création des ateliers impossible : ' + error.message); }
    data.forEach((a) => ids.set(norm(a.nom), a.id));
  }
  const lignes = aImporter.map((l) => ({ esat_id: p.esat_id, atelier_id: ids.get(norm(l.atelier)), nom: l.nom, prenom: l.prenom }));
  for (let i = 0; i < lignes.length; i += 500) {
    const { error } = await sb.from('travailleurs').insert(lignes.slice(i, i + 500));
    if (error) {
      await chargerGestion(true);
      return refuser('Import interrompu : ' + error.message + ' (les lignes précédentes ont été importées ; relancez le fichier, les doublons seront ignorés).');
    }
  }
  g.import = null;
  await chargerGestion(false, p.esat_id);
  S.g.msg = aImporter.length + ' travailleur(s) importé(s)' + (nouveaux.length ? ', ' + nouveaux.length + ' atelier(s) créé(s)' : '') + '.';
  vueGestion();
}

function telechargerModele() {
  if (typeof XLSX === 'undefined') return refuser('Le lecteur de fichiers n’a pas pu se charger : rechargez la page.');
  const ws = XLSX.utils.aoa_to_sheet([['Atelier', 'Nom', 'Prénom'], ['Exemple (à supprimer)', 'Exemple', 'Exemple']]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Travailleurs');
  XLSX.writeFile(wb, 'modele-import-atelio.xlsx');
}

// --- Comptes (accès à Atelio) -------------------------------------------
async function appelerComptes(corps) {
  const { data, error } = await sb.functions.invoke('bright-api', { body: corps }); // identifiant de la fonction « gerer-comptes » dans Supabase
  if (error) {
    let message = 'Le service des comptes est indisponible. Réessayez dans un instant.';
    try { const r = await error.context.json(); if (r && r.erreur) message = r.erreur; } catch (e) { /* message par défaut */ }
    return { erreur: message };
  }
  if (data && data.erreur) return { erreur: data.erreur };
  return { data };
}

async function creerCompte(emailIn, roleSel, atSel, mdpIn, prenomIn) {
  const g = S.g;
  if (g.occupe) return;
  const email = emailIn.value.trim();
  const role = roleSel ? roleSel.value : 'moniteur';
  const atelierId = role === 'moniteur' ? atSel.value : null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return refuser('Adresse e-mail invalide.');
  if (role === 'moniteur' && !atelierId) return refuser('Créez d’abord un atelier, puis choisissez celui du moniteur.');
  const mdp = mdpIn ? mdpIn.value : '';
  if (mdp.trim() !== '' && mdp.length < MDP_MIN) return refuser('Le mot de passe doit contenir au moins ' + MDP_MIN + ' caractères.');
  g.occupe = true; g.err = ''; g.msg = '';
  vueGestion();
  const corps = { action: 'inviter', email, role, esat_id: g.esatId, atelier_id: atelierId };
  if (mdp.trim() !== '') corps.mot_de_passe = mdp;
  const prenom = prenomIn ? prenomIn.value.trim().slice(0, 40) : '';
  if (prenom) corps.prenom = prenom;
  const r = await appelerComptes(corps);
  g.occupe = false;
  if (r.erreur) return refuser(r.erreur);
  await chargerGestion(true);
  S.g.identifiants = { titre: 'Compte créé. Transmettez ces informations à la personne :', email: r.data.email, mdp: r.data.mot_de_passe, role };
  vueGestion();
}

function ouvrirReinit(c) { S.g.reinit = c; S.g.identifiants = null; S.g.err = ''; S.g.msg = ''; vueGestion(); }

// mdp vide = mot de passe généré automatiquement
async function nouveauMotDePasse(c, mdpIn) {
  const g = S.g;
  if (g.occupe) return;
  const mdp = mdpIn ? mdpIn.value : '';
  if (mdp.trim() !== '' && mdp.length < MDP_MIN) return refuser('Le mot de passe doit contenir au moins ' + MDP_MIN + ' caractères.');
  g.occupe = true; g.err = ''; g.msg = '';
  vueGestion();
  const corps = { action: 'nouveau_mot_de_passe', user_id: c.id };
  if (mdp.trim() !== '') corps.mot_de_passe = mdp;
  const r = await appelerComptes(corps);
  g.occupe = false;
  if (r.erreur) return refuser(r.erreur);
  g.reinit = null;
  g.identifiants = { titre: 'Nouveau mot de passe enregistré. Transmettez-le à la personne :', email: r.data.email, mdp: r.data.mot_de_passe, role: c.role };
  vueGestion();
}

async function basculerCompte(c) {
  const g = S.g;
  if (g.occupe) return;
  if (c.actif && !window.confirm('Désactiver l’accès de ' + c.email + ' ? Cette personne ne pourra plus se connecter (son historique est conservé).')) return;
  g.occupe = true; g.err = ''; g.msg = '';
  vueGestion();
  const r = await appelerComptes({ action: 'activer', user_id: c.id, actif: !c.actif });
  g.occupe = false;
  if (r.erreur) return refuser(r.erreur);
  await chargerGestion(true);
  S.g.msg = 'Accès de ' + c.email + (c.actif ? ' désactivé.' : ' réactivé.');
  vueGestion();
}

async function copierIdentifiants() {
  const i = S.g.identifiants;
  const temporaire = i.role !== 'moniteur';
  const texte = 'Bonjour,\n\nVotre accès à Atelio est prêt.\nAdresse du site : ' + window.location.origin +
    '\nIdentifiant : ' + i.email + '\nMot de passe' + (temporaire ? ' temporaire' : '') + ' : ' + i.mdp +
    (temporaire ? '\n\nÀ votre première connexion, vous choisirez votre propre mot de passe.' : '\n\nGardez-le précieusement : en cas d’oubli, demandez-en un nouveau à la direction de votre ESAT.');
  try {
    await navigator.clipboard.writeText(texte);
    S.g.msg = 'Message copié : collez-le dans un e-mail ou un SMS.'; S.g.err = '';
  } catch (e) {
    S.g.err = 'Copie impossible : recopiez les informations ci-dessus à la main.'; S.g.msg = '';
  }
  vueGestion();
}

// Première connexion avec un mot de passe temporaire : la personne en choisit un nouveau.
function vueChangerMdp(options) {
  const volontaire = !!(options && options.volontaire);
  const m1 = h('input', { id: 'mdp1', class: 'in', type: 'password', autocomplete: 'new-password', required: true });
  const m2 = h('input', { id: 'mdp2', class: 'in', type: 'password', autocomplete: 'new-password', required: true });
  const erreur = h('p', { class: 'err', role: 'alert' });
  const bouton = h('button', { type: 'submit', class: 'primary' }, 'Enregistrer mon mot de passe');
  const form = h('form', {
    class: 'card login',
    onSubmit: async (e) => {
      e.preventDefault();
      erreur.textContent = '';
      if (m1.value.length < MDP_MIN) { erreur.textContent = 'Le mot de passe doit contenir au moins ' + MDP_MIN + ' caractères.'; return; }
      if (m1.value !== m2.value) { erreur.textContent = 'Les deux mots de passe ne sont pas identiques.'; return; }
      bouton.disabled = true;
      const { error } = await sb.auth.updateUser({ password: m1.value, data: { mdp_temporaire: false } });
      if (error) {
        erreur.textContent = /different/i.test(error.message)
          ? 'Choisissez un mot de passe différent du mot de passe temporaire.'
          : 'Impossible de changer le mot de passe : ' + error.message;
        bouton.disabled = false;
        return;
      }
      S.mdpFait = true;
      await sb.auth.refreshSession();
      if (!volontaire) return demarrer();
      render(h('main', { class: 'center' }, h('section', { class: 'card login' },
        h('h1', {}, 'Mot de passe modifié'),
        h('p', { class: 'ok', role: 'status' }, 'Votre nouveau mot de passe est enregistré.'),
        h('button', { type: 'button', class: 'primary', onClick: demarrer }, 'Retour'))));
    }
  },
    h('img', { src: 'logo.png', alt: 'Atelio' }),
    h('h1', {}, volontaire ? 'Changer mon mot de passe' : 'Choisissez votre mot de passe'),
    h('p', { class: 'muted' }, volontaire
      ? 'Choisissez un nouveau mot de passe que vous seul connaissez (5 caractères minimum).'
      : 'C’est votre première connexion. Choisissez un mot de passe que vous seul connaissez (5 caractères minimum).'),
    champ('mdp1', 'Nouveau mot de passe', m1),
    champ('mdp2', 'Confirmez le mot de passe', m2),
    erreur,
    bouton,
    volontaire
      ? h('button', { type: 'button', class: 'linkbtn', onClick: demarrer }, 'Annuler')
      : h('button', { type: 'button', class: 'linkbtn', onClick: deconnexion }, 'Se déconnecter')
  );
  render(h('main', { class: 'center' }, form));
}

// Conserve ce qui est déjà tapé dans le formulaire d'ajout quand on clique sur un modèle d'horaires
function garderSaisieAjout() {
  const v = (id) => { const e = document.getElementById(id); return e ? e.value : ''; };
  S.gh.brouillon = { nom: v('nvNom'), prenom: v('nvPrenom'), at: v('nvAt') };
}

function vueGestion() {
  const g = S.g;

  // ----- Ateliers
  const nvAtelier = h('input', { id: 'nvAtelier', class: 'in', type: 'text', style: 'max-width:340px' });
  const blocAteliers = h('section', { class: 'card stack', 'aria-labelledby': 'g-ateliers' },
    h('h2', { id: 'g-ateliers' }, 'Ateliers'),
    g.ateliers.length === 0 ? h('p', { class: 'muted' }, 'Aucun atelier pour l’instant : créez le premier ci-dessous.') : null,
    h('ul', { class: 'list', style: 'gap:10px' }, g.ateliers.map((a) => {
      const champNom = h('input', { class: 'in', type: 'text', value: a.nom, 'aria-label': 'Nom de l’atelier ' + a.nom, style: 'max-width:340px' });
      const nb = g.travailleurs.filter((w) => w.atelier_id === a.id && w.actif).length;
      return h('li', { class: 'row', style: 'justify-content:flex-start' },
        champNom,
        h('span', { class: 'muted' }, nb + (nb > 1 ? ' travailleurs actifs' : ' travailleur actif')),
        h('button', { type: 'button', class: 'secondary', onClick: () => renommerAtelier(a, champNom.value) }, 'Enregistrer le nom'));
    })),
    h('div', { class: 'stack', style: 'border-top:1px solid #d3d3d8;padding-top:18px' },
      champ('nvAtelier', 'Nouvel atelier', nvAtelier),
      h('div', {}, h('button', { type: 'button', class: 'primary', onClick: () => ajouterAtelier(nvAtelier) }, 'Ajouter l’atelier'))));

  // ----- Travailleurs
  const filtre = h('select', { id: 'filtreAtelier', class: 'in', style: 'max-width:300px', onChange: (e) => { g.filtre = e.target.value; vueGestion(); } },
    h('option', { value: 'tous' }, 'Tous les ateliers'), g.ateliers.map((a) => h('option', { value: a.id }, a.nom)));
  filtre.value = g.filtre;
  const liste = g.travailleurs
    .filter((w) => (g.inactifs || w.actif) && (g.filtre === 'tous' || w.atelier_id === g.filtre))
    .sort(parNomPrenom);
  const lignes = liste.map((w) => {
    const sel = h('select', { class: 'in', style: 'min-width:170px', 'aria-label': 'Atelier de ' + w.prenom + ' ' + w.nom, onChange: (e) => changerAtelier(w, e.target.value) },
      g.ateliers.map((a) => h('option', { value: a.id }, a.nom)));
    sel.value = w.atelier_id;
    const gh = GH();
    const enEdition = gh.ed === w.id;
    return h('tr', { class: w.actif ? '' : 'off' },
      h('td', {}, w.nom), h('td', {}, w.prenom), h('td', {}, sel),
      h('td', {}, enEdition
        ? h('div', { class: 'stack', style: 'gap:10px;min-width:320px' },
            editeurHoraires(gh.val, (v, rafraichir) => { gh.val = v; if (rafraichir) vueGestion(); }, 'ed' + w.id),
            h('div', { class: 'row', style: 'justify-content:flex-start' },
              h('button', { type: 'button', class: 'primary', style: 'min-height:44px', onClick: () => enregistrerHoraires(w) }, 'Enregistrer'),
              h('button', { type: 'button', class: 'secondary', style: 'min-height:44px', onClick: () => { gh.ed = null; vueGestion(); } }, 'Annuler')))
        : h('div', { class: 'stack', style: 'gap:6px' },
            h('span', {}, resumeHoraires(horairesDe(w))),
            h('button', { type: 'button', class: 'linkbtn', 'aria-label': 'Modifier les horaires de ' + w.prenom + ' ' + w.nom,
              onClick: () => { gh.ed = w.id; gh.val = horairesDe(w); vueGestion(); } }, 'Modifier les horaires'))),
      h('td', {}, h('span', { class: 'tag' }, w.actif ? 'Actif' : 'Désactivé')),
      h('td', {}, h('button', { type: 'button', class: w.actif ? 'rm' : 'secondary', style: 'min-height:44px',
        'aria-label': (w.actif ? 'Désactiver ' : 'Réactiver ') + w.prenom + ' ' + w.nom, onClick: () => basculerActif(w) }, w.actif ? 'Désactiver' : 'Réactiver')));
  });

  const nvNom = h('input', { id: 'nvNom', class: 'in', type: 'text' });
  const nvPrenom = h('input', { id: 'nvPrenom', class: 'in', type: 'text' });
  const nvAt = h('select', { id: 'nvAt', class: 'in' }, g.ateliers.map((a) => h('option', { value: a.id }, a.nom)));
  if (g.filtre !== 'tous') nvAt.value = g.filtre;
  const br = GH().brouillon;
  if (br) { nvNom.value = br.nom; nvPrenom.value = br.prenom; if (br.at) nvAt.value = br.at; GH().brouillon = null; }

  const blocTravailleurs = h('section', { class: 'card stack', 'aria-labelledby': 'g-trav' },
    h('h2', { id: 'g-trav' }, 'Travailleurs'),
    h('p', { class: 'muted' }, 'Un travailleur désactivé n’apparaît plus dans les saisies des moniteurs, mais son historique reste dans le tableau de bord. Rien n’est jamais supprimé.'),
    h('div', { class: 'row', style: 'justify-content:flex-start' },
      h('div', {}, h('label', { class: 'lbl', for: 'filtreAtelier' }, 'Atelier'), filtre),
      h('label', { style: 'display:flex;align-items:center;gap:10px;min-height:48px;font-weight:700' },
        h('input', { type: 'checkbox', checked: g.inactifs, style: 'width:22px;height:22px', onChange: (e) => { g.inactifs = e.target.checked; vueGestion(); } }),
        'Afficher les travailleurs désactivés')),
    h('div', { class: 'scroll' }, h('table', { class: 'tbl' },
      h('caption', { class: 'sr' }, 'Liste des travailleurs'),
      h('thead', {}, h('tr', {}, h('th', {}, 'Nom'), h('th', {}, 'Prénom'), h('th', {}, 'Atelier'), h('th', {}, 'Horaires'), h('th', {}, 'État'), h('th', {}, 'Action'))),
      h('tbody', {}, lignes.length ? lignes : h('tr', {}, h('td', { colspan: '6' }, 'Aucun travailleur à afficher.'))))),
    h('div', { class: 'stack', style: 'border-top:1px solid #d3d3d8;padding-top:18px' },
      h('h3', {}, 'Ajouter un travailleur'),
      h('div', { class: 'fields' },
        h('div', { style: 'flex:1 1 180px' }, h('label', { class: 'lbl', for: 'nvNom' }, 'Nom'), nvNom),
        h('div', { style: 'flex:1 1 180px' }, h('label', { class: 'lbl', for: 'nvPrenom' }, 'Prénom'), nvPrenom),
        h('div', { style: 'flex:1 1 200px' }, h('label', { class: 'lbl', for: 'nvAt' }, 'Atelier'), nvAt)),
      h('div', { class: 'stack', style: 'gap:8px' },
        h('span', { class: 'lbl' }, 'Horaires de travail'),
        h('p', { class: 'muted' }, 'Par défaut : journée entière du lundi au vendredi. Choisissez matin ou après-midi, ou « Ne travaille pas » pour les jours d’absence habituels.'),
        editeurHoraires(GH().nv, (v, rafraichir) => { GH().nv = v; if (rafraichir) { garderSaisieAjout(); vueGestion(); } }, 'nv')),
      h('div', {}, h('button', { type: 'button', class: 'primary', onClick: () => ajouterTravailleur(nvNom, nvPrenom, nvAt) }, 'Ajouter le travailleur'))));

  // ----- Comptes
  const estSuper = S.profil.role === 'super_admin';
  const nomAtelier = Object.fromEntries(g.ateliers.map((a) => [a.id, a.nom]));
  const cpEmail = h('input', { id: 'cpEmail', class: 'in', type: 'email', autocomplete: 'off' });
  const cpRole = estSuper
    ? h('select', { id: 'cpRole', class: 'in' }, h('option', { value: 'moniteur' }, 'Moniteur'), h('option', { value: 'admin_esat' }, 'Administrateur de l’ESAT'))
    : null;
  const cpPrenom = h('input', { id: 'cpPrenom2', class: 'in', type: 'text', maxlength: '40', autocomplete: 'off' });
  const cpMdp = h('input', { id: 'cpMdp', class: 'in', type: 'text', autocomplete: 'off', style: 'max-width:340px' });
  const cpAt = h('select', { id: 'cpAt', class: 'in' }, g.ateliers.map((a) => h('option', { value: a.id }, a.nom)));
  const lignesComptes = g.comptes.map((c) => h('tr', { class: c.actif ? '' : 'off' },
    h('td', {}, c.email),
    h('td', {}, ROLES[c.role] || c.role),
    h('td', {}, c.role === 'moniteur' ? (nomAtelier[c.atelier_id] || '—') : '—'),
    h('td', {}, h('span', { class: 'tag' }, c.actif ? 'Actif' : 'Désactivé')),
    h('td', {}, c.id === S.user.id ? 'Vous' : h('div', { class: 'row', style: 'gap:8px;justify-content:flex-start' },
      h('button', { type: 'button', class: 'secondary', style: 'min-height:44px', disabled: g.occupe,
        'aria-label': 'Nouveau mot de passe pour ' + c.email, onClick: () => ouvrirReinit(c) }, 'Nouveau mot de passe'),
      h('button', { type: 'button', class: c.actif ? 'rm' : 'secondary', style: 'min-height:44px', disabled: g.occupe,
        'aria-label': (c.actif ? 'Désactiver l’accès de ' : 'Réactiver l’accès de ') + c.email, onClick: () => basculerCompte(c) }, c.actif ? 'Désactiver' : 'Réactiver')))));
  const rzMdp = h('input', { id: 'rzMdp', class: 'in', type: 'text', autocomplete: 'off', style: 'max-width:340px' });
  const formReinit = g.reinit
    ? h('div', { class: 'card stack', role: 'group', 'aria-labelledby': 'rz-titre', style: 'background:#fff;box-shadow:inset 0 0 0 1px var(--encre)' },
        h('h3', { id: 'rz-titre' }, 'Nouveau mot de passe pour ' + g.reinit.email),
        h('div', {}, h('label', { class: 'lbl', for: 'rzMdp' }, 'Mot de passe (' + MDP_MIN + ' caractères minimum)'), rzMdp),
        h('p', { class: 'muted' }, 'Laissez vide pour que Atelio en génère un automatiquement. L’ancien mot de passe ne fonctionnera plus.'),
        h('div', { class: 'row', style: 'justify-content:flex-start' },
          h('button', { type: 'button', class: 'primary', disabled: g.occupe, onClick: () => nouveauMotDePasse(g.reinit, rzMdp) }, g.occupe ? 'Un instant…' : 'Enregistrer'),
          h('button', { type: 'button', class: 'secondary', disabled: g.occupe, onClick: () => { g.reinit = null; vueGestion(); } }, 'Annuler')))
    : null;
  const identifiants = g.identifiants
    ? h('div', { class: 'banner', role: 'status', style: 'flex-direction:column;align-items:flex-start' },
        h('p', {}, g.identifiants.titre),
        h('p', { style: 'font-size:17px' }, 'Adresse e-mail : ', h('strong', {}, g.identifiants.email)),
        h('p', { style: 'font-size:17px' }, (g.identifiants.role === 'moniteur' ? 'Mot de passe : ' : 'Mot de passe temporaire : '), h('strong', { style: 'font-family:monospace;font-size:21px;letter-spacing:1px' }, g.identifiants.mdp)),
        h('p', { class: 'muted', style: 'font-weight:400' }, g.identifiants.role === 'moniteur'
          ? 'Ce mot de passe ne sera plus affiché. Le moniteur ne peut pas le modifier : en cas d’oubli, vous lui en donnez un nouveau.'
          : 'Ce mot de passe ne sera plus affiché. La personne devra en choisir un nouveau à sa première connexion.'),
        h('button', { type: 'button', class: 'secondary', onClick: copierIdentifiants }, 'Copier le message à envoyer'))
    : null;
  const blocComptes = h('section', { class: 'card stack', 'aria-labelledby': 'g-comptes' },
    h('h2', { id: 'g-comptes' }, 'Comptes (accès à Atelio)'),
    h('p', { class: 'muted' }, 'Seules les personnes ajoutées ici peuvent se connecter. Un moniteur ne voit et ne remplit que son atelier.'),
    identifiants,
    formReinit,
    h('div', { class: 'scroll' }, h('table', { class: 'tbl' },
      h('caption', { class: 'sr' }, 'Liste des comptes'),
      h('thead', {}, h('tr', {}, h('th', {}, 'Adresse e-mail'), h('th', {}, 'Rôle'), h('th', {}, 'Atelier'), h('th', {}, 'État'), h('th', {}, 'Actions'))),
      h('tbody', {}, lignesComptes.length ? lignesComptes : h('tr', {}, h('td', { colspan: '5' }, 'Aucun compte pour l’instant.'))))),
    h('div', { class: 'stack', style: 'border-top:1px solid #d3d3d8;padding-top:18px' },
      h('h3', {}, 'Créer un accès'),
      h('div', { class: 'fields' },
        h('div', { style: 'flex:2 1 260px' }, h('label', { class: 'lbl', for: 'cpEmail' }, 'Adresse e-mail'), cpEmail),
        h('div', { style: 'flex:1 1 180px' }, h('label', { class: 'lbl', for: 'cpPrenom2' }, 'Prénom (facultatif)'), cpPrenom),
        cpRole ? h('div', { style: 'flex:1 1 200px' }, h('label', { class: 'lbl', for: 'cpRole' }, 'Rôle'), cpRole) : null,
        h('div', { style: 'flex:1 1 200px' }, h('label', { class: 'lbl', for: 'cpAt' }, estSuper ? 'Atelier (pour un moniteur)' : 'Atelier du moniteur'), cpAt)),
      h('div', {}, h('label', { class: 'lbl', for: 'cpMdp' }, 'Mot de passe (facultatif, ' + MDP_MIN + ' caractères minimum)'), cpMdp),
      h('div', {}, h('button', { type: 'button', class: 'primary', disabled: g.occupe, onClick: () => creerCompte(cpEmail, cpRole, cpAt, cpMdp, cpPrenom) },
        g.occupe ? 'Un instant…' : 'Créer l’accès')),
      h('p', { class: 'muted' }, 'Aucun e-mail n’est envoyé : vous choisissez le mot de passe (ou laissez le champ vide pour qu’Atelio en génère un), puis vous le transmettez à la personne. Un moniteur ne peut pas modifier son mot de passe ; un administrateur d’ESAT choisira le sien à sa première connexion.')));

  // ----- Import
  let apercu = null;
  if (g.import) {
    const L = g.import.lignes;
    const n = (e) => L.filter((l) => l.etat === e).length;
    const aImporter = n('nouveau');
    const nbAteliers = new Set(L.filter((l) => l.etat === 'nouveau' && l.nouvelAtelier).map((l) => norm(l.atelier))).size;
    const etiquette = (l) => (l.etat === 'nouveau' ? (l.nouvelAtelier ? 'À importer (nouvel atelier)' : 'À importer')
      : l.etat === 'doublon' ? 'Déjà présent : ignoré' : 'Incomplet : ignoré');
    apercu = h('div', { class: 'stack' },
      h('p', { style: 'font-weight:700;font-size:18px' }, 'Fichier « ' + g.import.fichier + ' » : ' + L.length + ' ligne(s) lue(s)'),
      h('p', {}, aImporter + ' à importer' + (nbAteliers ? ' (dont ' + nbAteliers + ' nouvel(s) atelier(s) à créer)' : '') + ' · ' + n('doublon') + ' déjà présent(s) · ' + n('incomplet') + ' incomplète(s)'),
      h('div', { class: 'scroll', style: 'max-height:360px;overflow-y:auto' }, h('table', { class: 'tbl' },
        h('caption', { class: 'sr' }, 'Aperçu de l’import'),
        h('thead', {}, h('tr', {}, h('th', {}, 'Atelier'), h('th', {}, 'Nom'), h('th', {}, 'Prénom'), h('th', {}, 'Résultat'))),
        h('tbody', {}, L.map((l) => h('tr', { class: l.etat === 'nouveau' ? '' : 'off' },
          h('td', {}, l.atelier), h('td', {}, l.nom), h('td', {}, l.prenom), h('td', {}, h('span', { class: 'tag' }, etiquette(l)))))))),
      h('div', { class: 'row', style: 'justify-content:flex-start' },
        h('button', { type: 'button', class: 'primary', disabled: aImporter === 0 || g.occupe, onClick: confirmerImport },
          g.occupe ? 'Import en cours…' : 'Importer ' + aImporter + ' travailleur(s)'),
        h('button', { type: 'button', class: 'secondary', disabled: g.occupe, onClick: () => { g.import = null; vueGestion(); } }, 'Annuler')));
  }

  const blocImport = h('section', { class: 'card stack', 'aria-labelledby': 'g-import' },
    h('h2', { id: 'g-import' }, 'Importer une liste depuis Excel'),
    h('p', { class: 'muted' }, 'Votre fichier doit avoir trois colonnes : Atelier, Nom, Prénom. Les ateliers qui n’existent pas encore sont créés, et les personnes déjà présentes sont ignorées.'),
    h('div', { class: 'row', style: 'justify-content:flex-start' },
      h('button', { type: 'button', class: 'secondary', onClick: telechargerModele }, 'Télécharger le modèle Excel'),
      h('div', {}, h('label', { class: 'lbl', for: 'fichierImport' }, 'Choisir mon fichier (.xlsx ou .csv)'),
        h('input', { id: 'fichierImport', type: 'file', accept: '.xlsx,.xls,.csv', class: 'in', onChange: (e) => lireFichier(e.target.files[0]) }))),
    apercu);

  render(pageAvec([
    S.profil.role === 'super_admin'
      ? h('div', {}, h('button', { type: 'button', class: 'secondary', onClick: () => chargerAdmin(g.esatId) }, '‹ Retour à l’espace éditeur'))
      : navAdminEsat('gestion'),
    h('div', { class: 'stack', style: 'gap:6px' }, h('p', { class: 'muted' }, g.esat), h('h1', {}, 'Gérer l’ESAT')),
    g.err ? h('p', { class: 'err', role: 'alert' }, g.err) : null,
    g.msg ? h('p', { class: 'ok', role: 'status' }, g.msg) : null,
    blocAteliers, blocTravailleurs, blocComptes, blocImport
  ], true));
}

// ---------------------------------------------------------------------
// REPORTING (administrateur d'ESAT) + CLÔTURE DE MOIS
// ---------------------------------------------------------------------
const SVGNS = 'http://www.w3.org/2000/svg';
const NEUTRE = '#8a8e99';                 // gris des repères (barres « contexte »)
const MOIS_COURTS_NB = 6;                 // le reporting regarde les 6 derniers mois

function sv(tag, attrs, ...kids) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const nf = (n, d) => Number(n).toLocaleString('fr-FR', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
const pct = (x, d) => nf(x * 100, d || 0) + ' %';
const cleMois = (a, m) => a + '-' + String(m + 1).padStart(2, '0');
const premierDuMois = (a, m) => isoJour(a, m, 1);
function jourCourt(iso) { return dateDepuisISO(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }); }
function moisCourt(a, m, avecAnnee) {
  const t = new Date(a, m, 1).toLocaleDateString('fr-FR', { month: 'short' });
  return avecAnnee ? t + ' ' + String(a).slice(2) : t;
}
function minuscule(s) { return s.charAt(0).toLowerCase() + s.slice(1); }
function texteSurFond(hex) { return contrasteBlanc(couleurSure(hex)) >= 4.5 ? '#ffffff' : '#17191c'; }

// Échelle « propre » : arrondit le maximum et choisit un pas lisible (0, 5, 10, 20...)
function echelle(max) {
  if (!(max > 0)) return { max: 4, pas: 1 };
  const brut = max / 4;
  const p = Math.pow(10, Math.floor(Math.log10(brut)));
  const pas = [1, 2, 2.5, 5, 10].map((k) => k * p).find((v) => v >= brut) || 10 * p;
  return { max: Math.ceil(max / pas) * pas, pas };
}

// Rectangle dont seul le bout « donnée » est arrondi (4 px) ; la base reste droite.
function rectBout(x, y, w, hh, cote) {
  const r = Math.max(0, Math.min(4, w / 2, hh / 2));
  if (hh <= 0 || w <= 0) return '';
  if (cote === 'haut') return `M${x},${y + hh}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + hh}Z`;
  return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + hh - r}Q${x + w},${y + hh} ${x + w - r},${y + hh}H${x}Z`; // « droite »
}

// --- Zone de graphique : redessinée quand la largeur change, avec une bulle d'information
function graphique(dessiner, description) {
  const boite = h('div', { class: 'gr', role: 'group', 'aria-label': description });
  const bulle = h('div', { class: 'bulle', hidden: true, 'aria-hidden': 'true' });
  let largeur = 0;
  const outils = {
    montrer(x, y, titre, lignes) {
      bulle.replaceChildren(h('div', { class: 'bulle-t' }, titre),
        lignes.map((l) => h('div', { class: 'bulle-l' },
          l.couleur ? h('i', { style: 'background:' + l.couleur }) : null,
          h('strong', {}, l.valeur), h('span', {}, ' ' + l.libelle))));
      bulle.hidden = false;
      const bw = bulle.offsetWidth || 160;
      const W = boite.clientWidth || largeur;
      bulle.style.left = Math.max(0, Math.min(W - bw, x > W * 0.6 ? x - bw - 12 : x + 12)) + 'px';
      bulle.style.top = Math.max(0, y - 10) + 'px';
    },
    cacher() { bulle.hidden = true; }
  };
  const tracer = (force) => {
    const w = Math.max(300, Math.floor(boite.clientWidth || 640));
    if (!force && w === largeur) return;
    largeur = w;
    boite.replaceChildren(dessiner(w, outils), bulle);
  };
  tracer(true);
  if (window.ResizeObserver) new ResizeObserver(() => tracer(false)).observe(boite);
  return boite;
}

// Rend une marque sensible au survol ET au clavier
function sensible(el, montrer, outils) {
  el.setAttribute('tabindex', '0');
  const bord = () => { const b = el.getBoundingClientRect(), p = el.closest('svg').getBoundingClientRect(); return [b.left - p.left + b.width / 2, b.top - p.top]; };
  el.addEventListener('pointermove', (e) => { const p = el.closest('svg').getBoundingClientRect(); montrer(e.clientX - p.left, e.clientY - p.top); });
  el.addEventListener('pointerleave', outils.cacher);
  el.addEventListener('focus', () => { const [x, y] = bord(); montrer(x, y); });
  el.addEventListener('blur', outils.cacher);
}

function legendeStatuts(liste) {
  return h('div', { class: 'leg' }, liste.map((s) =>
    h('span', { class: 'leg-i' }, h('i', { style: 'background:' + couleurSure(s.couleur) }), s.code + ' · ' + s.nom)));
}

function donnees(entetes, lignes) {
  return h('details', { class: 'donnees' }, h('summary', {}, 'Voir les données en tableau'),
    h('div', { class: 'scroll' }, h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {}, entetes.map((t) => h('th', {}, t)))),
      h('tbody', {}, lignes.map((l) => h('tr', {}, l.map((c) => h('td', {}, c))))))));
}

// ---------------------------------------------------------------------
// Les 5 graphiques
// ---------------------------------------------------------------------
const M = { g: 46, d: 20, h: 22, b: 30 };

function axeY(svg, w, hauteur, echel, format) {
  const y = (v) => M.h + (hauteur - M.h - M.b) * (1 - v / echel.max);
  for (let v = 0; v <= echel.max + 1e-9; v += echel.pas) {
    svg.append(sv('line', { x1: M.g, x2: w - M.d, y1: y(v), y2: y(v), class: v === 0 ? 'gx base' : 'gx' }));
    svg.append(sv('text', { x: M.g - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'ax' }, format ? format(v) : nf(v, echel.pas < 1 ? 1 : 0)));
  }
  return y;
}

// 1. Taux de présence mois par mois (ligne)
function grapheTendance(r) {
  const serie = r.mois6.map((x) => ({ x, v: x.taux }));
  const connus = serie.filter((p) => p.v != null);
  return graphique((w, o) => {
    const H = 250;
    const svg = sv('svg', { width: w, height: H, viewBox: `0 0 ${w} ${H}`, class: 'svg' });
    const lo = connus.length ? Math.max(0, Math.floor((Math.min(...connus.map((p) => p.v)) * 100 - 6) / 10) * 10) : 0;
    const e = { max: 100 - lo, pas: (100 - lo) <= 20 ? 5 : 10 };
    const yy = (v) => M.h + (H - M.h - M.b) * (1 - (v * 100 - lo) / e.max);
    for (let v = lo; v <= 100; v += e.pas) {
      const py = yy(v / 100);
      svg.append(sv('line', { x1: M.g, x2: w - M.d, y1: py, y2: py, class: v === lo ? 'gx base' : 'gx' }));
      svg.append(sv('text', { x: M.g - 8, y: py + 4, 'text-anchor': 'end', class: 'ax' }, v + ' %'));
    }
    const bande = (w - M.g - M.d) / serie.length;
    const px = (i) => M.g + bande * (i + 0.5);
    serie.forEach((p, i) => svg.append(sv('text', { x: px(i), y: H - 8, 'text-anchor': 'middle', class: 'ax' }, moisCourt(p.x.a, p.x.m, p.x.m === 0 || i === 0))));
    const chemin = [];
    let ouvert = false;
    serie.forEach((p, i) => { if (p.v == null) { ouvert = false; return; } chemin.push((ouvert ? 'L' : 'M') + px(i) + ',' + yy(p.v)); ouvert = true; });
    const vert = couleurSure(r.couleurP);
    if (chemin.length) svg.append(sv('path', { d: chemin.join(''), fill: 'none', stroke: vert, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    const repere = sv('line', { y1: M.h, y2: H - M.b, class: 'cross', visibility: 'hidden' });
    svg.append(repere);
    serie.forEach((p, i) => {
      if (p.v == null) return;
      const dernier = i === serie.length - 1 || serie.slice(i + 1).every((q) => q.v == null);
      const sel = i === r.idxMois;
      svg.append(sv('circle', { cx: px(i), cy: yy(p.v), r: sel ? 6 : 4.5, fill: vert, stroke: '#fff', 'stroke-width': 2 }));
      if (dernier || sel) svg.append(sv('text', { x: px(i), y: yy(p.v) - 12, 'text-anchor': 'middle', class: 'val' }, pct(p.v, 0)));
    });
    const survol = (i) => {
      const p = serie[i]; const x = px(i);
      repere.setAttribute('x1', x); repere.setAttribute('x2', x); repere.setAttribute('visibility', 'visible');
      const m = p.x;
      o.montrer(x, p.v == null ? H / 2 : yy(p.v), libelleMois(m.a, m.m), p.v == null
        ? [{ valeur: '—', libelle: 'aucune saisie' }]
        : [{ couleur: vert, valeur: pct(p.v, 1), libelle: 'de présence' }, { valeur: nf(m.presents), libelle: 'présents sur ' + nf(m.saisies) + ' saisies' }]);
    };
    const zone = sv('rect', { x: M.g, y: 0, width: w - M.g - M.d, height: H - M.b, fill: 'transparent' });
    zone.addEventListener('pointermove', (ev) => {
      const b = svg.getBoundingClientRect();
      const i = Math.max(0, Math.min(serie.length - 1, Math.floor((ev.clientX - b.left - M.g) / bande)));
      survol(i);
    });
    zone.addEventListener('pointerleave', () => { repere.setAttribute('visibility', 'hidden'); o.cacher(); });
    svg.append(zone);
    serie.forEach((p, i) => {
      if (p.v == null) return;
      const cible = sv('circle', { cx: px(i), cy: yy(p.v), r: 14, fill: 'transparent', tabindex: 0, 'aria-label': libelleMois(p.x.a, p.x.m) + ' : ' + pct(p.v, 1) });
      cible.addEventListener('focus', () => survol(i));
      cible.addEventListener('blur', () => { repere.setAttribute('visibility', 'hidden'); o.cacher(); });
      svg.append(cible);
    });
    return svg;
  }, 'Taux de présence sur les six derniers mois : ' + r.mois6.map((x) => libelleMois(x.a, x.m) + ' ' + (x.taux == null ? 'sans saisie' : pct(x.taux, 0))).join(', '));
}

// 2. Absences par motif, mois par mois (colonnes empilées)
function grapheAbsencesMois(r) {
  const mots = r.statutsAbs;
  const totaux = r.mois6.map((x) => mots.reduce((t, s) => t + (x.cpt[s.id] || 0), 0));
  return graphique((w, o) => {
    const H = 250;
    const svg = sv('svg', { width: w, height: H, viewBox: `0 0 ${w} ${H}`, class: 'svg' });
    const e = echelle(Math.max(...totaux, 0));
    const y = axeY(svg, w, H, e);
    const bande = (w - M.g - M.d) / r.mois6.length;
    const lc = Math.min(24, bande * 0.5);
    r.mois6.forEach((x, i) => {
      const cx = M.g + bande * (i + 0.5);
      svg.append(sv('text', { x: cx, y: H - 8, 'text-anchor': 'middle', class: 'ax' }, moisCourt(x.a, x.m, x.m === 0 || i === 0)));
      const segs = mots.map((s) => ({ s, n: x.cpt[s.id] || 0 })).filter((q) => q.n > 0);
      let bas = y(0);
      segs.forEach((q, k) => {
        const yh = y(segs.slice(0, k + 1).reduce((t, z) => t + z.n, 0));
        const hh = Math.max(1, bas - yh - (k < segs.length - 1 ? 2 : 0));
        const dernier = k === segs.length - 1;
        const fond = couleurSure(q.s.couleur);
        const el = dernier
          ? sv('path', { d: rectBout(cx - lc / 2, bas - hh, lc, hh, 'haut'), fill: fond })
          : sv('rect', { x: cx - lc / 2, y: bas - hh, width: lc, height: hh, fill: fond });
        sensible(el, (px, py) => o.montrer(px, py, libelleMois(x.a, x.m), segs.map((z) => ({ couleur: couleurSure(z.s.couleur), valeur: nf(z.n), libelle: z.s.nom + (z.s === q.s ? ' ◂' : '') }))
          .concat([{ valeur: nf(totaux[i]), libelle: 'jours d’absence au total' }])), o);
        el.setAttribute('aria-label', libelleMois(x.a, x.m) + ' : ' + q.s.nom + ', ' + q.n);
        svg.append(el);
        if (hh >= 16 && q.s.code.length <= 2) svg.append(sv('text', { x: cx, y: bas - hh / 2 + 4, 'text-anchor': 'middle', class: 'seg', fill: texteSurFond(fond), 'pointer-events': 'none' }, q.s.code));
        bas = bas - hh - 2;
      });
      if (totaux[i] > 0) svg.append(sv('text', { x: cx, y: y(totaux[i]) - 8, 'text-anchor': 'middle', class: 'val' }, nf(totaux[i])));
    });
    return svg;
  }, 'Jours d’absence par motif sur six mois : ' + r.mois6.map((x, i) => libelleMois(x.a, x.m) + ' ' + totaux[i]).join(', '));
}

// 3. Taux de présence jour par jour dans le mois (colonnes)
function grapheJours(r) {
  const j = r.jours;
  const vert = couleurSure(r.couleurP);
  const orange = couleurSure(r.couleurA);
  return graphique((w, o) => {
    const H = 250;
    const svg = sv('svg', { width: w, height: H, viewBox: `0 0 ${w} ${H}`, class: 'svg' });
    const y = axeY(svg, w, H, { max: 100, pas: 25 }, (v) => v + ' %');
    const bande = (w - M.g - M.d) / Math.max(j.length, 1);
    const lc = Math.max(4, Math.min(24, bande * 0.62));
    const creux = j.length > 2 ? j.reduce((a, b) => (b.taux < a.taux ? b : a)) : null;
    const emphase = creux && creux.taux < 1 && j.some((q) => q.taux > creux.taux) ? creux : null;
    const pasEtiq = bande >= 22 ? 1 : (bande >= 12 ? 2 : 5);
    j.forEach((q, i) => {
      const cx = M.g + bande * (i + 0.5);
      if (i % pasEtiq === 0 || i === j.length - 1) svg.append(sv('text', { x: cx, y: H - 8, 'text-anchor': 'middle', class: 'ax' }, String(+q.iso.slice(8))));
      const hh = Math.max(2, y(0) - y(q.taux * 100));
      const el = sv('path', { d: rectBout(cx - lc / 2, y(0) - hh, lc, hh, 'haut'), fill: q === emphase ? orange : vert });
      sensible(el, (px, py) => o.montrer(px, py, jourCourt(q.iso), [
        { couleur: vert, valeur: pct(q.taux, 0), libelle: 'de présence' },
        { valeur: nf(q.presents) + ' / ' + nf(q.saisies), libelle: 'présents / renseignés' }]), o);
      el.setAttribute('aria-label', jourCourt(q.iso) + ' : ' + pct(q.taux, 0));
      svg.append(el);
    });
    return svg;
  }, 'Taux de présence jour par jour en ' + libelleMois(r.annee, r.mois));
}

// 4. Comparaison des ateliers (barres horizontales à 100 %)
function grapheAteliers(r) {
  const liste = r.ateliersStats;
  const lignes = [{ s: r.statutP }].concat(r.statutsAbs.map((s) => ({ s })));
  return graphique((w, o) => {
    const pas = 40; const bh = 20; const G = 170; const D = 70;
    const H = liste.length * pas + 10;
    const svg = sv('svg', { width: w, height: H, viewBox: `0 0 ${w} ${H}`, class: 'svg' });
    const largeur = Math.max(40, w - G - D);
    liste.forEach((a, i) => {
      const y0 = 5 + i * pas + (pas - bh) / 2;
      const nom = a.nom.length > 23 ? a.nom.slice(0, 22) + '…' : a.nom;
      svg.append(sv('text', { x: G - 12, y: y0 + bh / 2 + 4, 'text-anchor': 'end', class: 'ax lab' }, nom, sv('title', {}, a.nom)));
      if (a.saisies === 0) {
        svg.append(sv('rect', { x: G, y: y0, width: largeur, height: bh, rx: 4, fill: 'var(--brume)' }));
        svg.append(sv('text', { x: G + 10, y: y0 + bh / 2 + 4, class: 'ax' }, 'Aucune saisie ce mois-ci'));
        return;
      }
      const segs = lignes.map((l) => ({ s: l.s, n: a.cpt[l.s.id] || 0 })).filter((q) => q.n > 0);
      let x = G;
      segs.forEach((q, k) => {
        const part = q.n / a.saisies;
        const lw = Math.max(1, part * largeur - (k < segs.length - 1 ? 2 : 0));
        const fond = couleurSure(q.s.couleur);
        const el = k === segs.length - 1
          ? sv('path', { d: rectBout(x, y0, lw, bh, 'droite'), fill: fond })
          : sv('rect', { x, y: y0, width: lw, height: bh, fill: fond });
        sensible(el, (px, py) => o.montrer(px, py, a.nom, [{ couleur: fond, valeur: nf(q.n) + ' (' + pct(part, 0) + ')', libelle: q.s.nom }, { valeur: nf(a.saisies), libelle: 'saisies au total' }]), o);
        el.setAttribute('aria-label', a.nom + ' : ' + q.s.nom + ' ' + pct(part, 0));
        svg.append(el);
        if (lw >= 40) svg.append(sv('text', { x: x + lw / 2, y: y0 + bh / 2 + 4, 'text-anchor': 'middle', class: 'seg', fill: texteSurFond(fond), 'pointer-events': 'none' }, pct(part, 0)));
        x += part * largeur;
      });
      svg.append(sv('text', { x: w - D + 14, y: y0 + bh / 2 + 5, class: 'val' }, pct(a.taux, 0)));
    });
    return svg;
  }, 'Répartition des statuts par atelier en ' + libelleMois(r.annee, r.mois));
}

// 5. Absences selon le jour de la semaine (emphase : le jour le plus touché)
function grapheSemaine(r) {
  const s = r.semaine;
  const orange = couleurSure(r.couleurA);
  const maxi = s.length ? s.reduce((a, b) => (b.taux > a.taux ? b : a)) : null;
  const pointe = maxi && maxi.taux > 0 && s.filter((q) => q.taux < maxi.taux).length > 0 ? maxi : null;
  return graphique((w, o) => {
    const H = 230;
    const svg = sv('svg', { width: w, height: H, viewBox: `0 0 ${w} ${H}`, class: 'svg' });
    const e = echelle(Math.max(...s.map((q) => q.taux * 100), 0));
    const y = axeY(svg, w, H, e, (v) => nf(v) + ' %');
    const bande = (w - M.g - M.d) / Math.max(s.length, 1);
    const lc = Math.min(24, bande * 0.45);
    s.forEach((q, i) => {
      const cx = M.g + bande * (i + 0.5);
      svg.append(sv('text', { x: cx, y: H - 8, 'text-anchor': 'middle', class: 'ax' }, q.nom));
      const hh = Math.max(2, y(0) - y(q.taux * 100));
      const fond = q === pointe ? orange : NEUTRE;
      const el = sv('path', { d: rectBout(cx - lc / 2, y(0) - hh, lc, hh, 'haut'), fill: fond });
      sensible(el, (px, py) => o.montrer(px, py, q.long, [
        { couleur: fond, valeur: pct(q.taux, 1), libelle: 'd’absence' },
        { valeur: nf(q.abs) + ' / ' + nf(q.saisies), libelle: 'absences / saisies' }]), o);
      el.setAttribute('aria-label', q.long + ' : ' + pct(q.taux, 1) + ' d’absence');
      svg.append(el);
      svg.append(sv('text', { x: cx, y: y(q.taux * 100) - 8, 'text-anchor': 'middle', class: 'val' }, pct(q.taux, 0)));
    });
    return svg;
  }, 'Taux d’absence selon le jour de la semaine, sur six mois');
}

// Petite courbe d'évolution dans une tuile
function miniCourbe(valeurs, couleur) {
  const pts = valeurs.map((v, i) => ({ v, i })).filter((p) => p.v != null);
  if (pts.length < 2) return null;
  const lo = Math.min(...pts.map((p) => p.v)); const hi = Math.max(...pts.map((p) => p.v));
  const W = 110; const Hh = 30;
  const px = (i) => 4 + (W - 8) * i / (valeurs.length - 1);
  const py = (v) => hi === lo ? Hh / 2 : 4 + (Hh - 8) * (1 - (v - lo) / (hi - lo));
  const dernier = pts[pts.length - 1];
  return sv('svg', { width: W, height: Hh, viewBox: `0 0 ${W} ${Hh}`, class: 'mini', 'aria-hidden': 'true' },
    sv('path', { d: pts.map((p, k) => (k ? 'L' : 'M') + px(p.i) + ',' + py(p.v)).join(''), fill: 'none', stroke: '#c3c5cc', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
    sv('circle', { cx: px(dernier.i), cy: py(dernier.v), r: 4, fill: couleur, stroke: '#fff', 'stroke-width': 2 }));
}

// ---------------------------------------------------------------------
// Chargement + calculs
// ---------------------------------------------------------------------
async function chargerReporting(choix) {
  const p = S.profil;
  const ancien = S.r || {};
  const now = new Date();
  let annee = choix && choix.annee != null ? choix.annee : (ancien.annee != null ? ancien.annee : now.getFullYear());
  let mois = choix && choix.mois != null ? choix.mois : (ancien.mois != null ? ancien.mois : now.getMonth());
  if (annee > now.getFullYear() || (annee === now.getFullYear() && mois > now.getMonth())) { annee = now.getFullYear(); mois = now.getMonth(); }
  const debutDt = new Date(annee, mois - (MOIS_COURTS_NB - 1), 1);
  const debut = premierDuMois(debutDt.getFullYear(), debutDt.getMonth());
  const fin = isoJour(annee, mois, nbJours(annee, mois));

  render(pageAvec([h('div', { class: 'noprint' }, navPrincipale('reporting')), h('p', { class: 'muted' }, 'Calcul des graphiques…')], true));
  const [e, at, st, tr, va, cl, fe] = await Promise.all([
    sb.from('esats').select('nom').eq('id', p.esat_id).maybeSingle(),
    sb.from('ateliers').select('id, nom').eq('esat_id', p.esat_id).order('nom'),
    sb.from('statuts').select('id, code, nom, couleur, ordre, esat_id').order('ordre').order('code'),
    sb.from('travailleurs').select('id, prenom, nom, atelier_id, actif').order('prenom'),
    toutLire(() => sb.from('journees_validees').select('atelier_id, jour').gte('jour', debut).lte('jour', fin).order('jour').order('atelier_id')),
    sb.from('mois_clotures').select('mois, cloture_le'),
    sb.from('jours_fermes').select('jour, motif').gte('jour', isoJour(annee, mois, 1)).lte('jour', fin)
  ]);
  const pr = await toutLire(() => sb.from('presences').select('id, travailleur_id, jour, statut_id').gte('jour', debut).lte('jour', fin).order('id'));
  const ko = [e, at, st, tr, va, pr].find((x) => x.error);
  if (ko) return vueMessage('Chargement impossible', ko.error.message);

  const clotures = {};
  (cl.data || []).forEach((x) => { clotures[String(x.mois).slice(0, 10)] = x.cloture_le || true; });
  S.r = {
    annee, mois, esat: e.data ? e.data.nom : '', ateliers: at.data, statuts: st.data, travailleurs: tr.data,
    validees: va.data, presences: pr.data, clotures, fermes: mapFermes(fe && !fe.error ? fe.data : [], [annee]), clotureIndispo: !!cl.error,
    confirmer: null, err: '', msg: ''
  };
  vueReporting();
}

function calculerReporting(r) {
  const parId = Object.fromEntries(r.statuts.map((s) => [s.id, s]));
  const statutP = r.statuts.find((s) => s.code === 'P' && !s.esat_id) || r.statuts[0];
  const statutA = r.statuts.find((s) => s.code === 'A' && !s.esat_id);
  const idP = statutP ? statutP.id : null;
  const statutsAbs = r.statuts.filter((s) => s.id !== idP);
  const atelierDe = Object.fromEntries(r.travailleurs.map((w) => [w.id, w.atelier_id]));
  const persDe = Object.fromEntries(r.travailleurs.map((w) => [w.id, w]));

  const mois6 = Array.from({ length: MOIS_COURTS_NB }, (_, i) => {
    const dt = new Date(r.annee, r.mois - (MOIS_COURTS_NB - 1) + i, 1);
    return { a: dt.getFullYear(), m: dt.getMonth(), cle: cleMois(dt.getFullYear(), dt.getMonth()), saisies: 0, presents: 0, cpt: {}, jours: new Set(), taux: null };
  });
  const parCle = Object.fromEntries(mois6.map((x) => [x.cle, x]));
  const cible = cleMois(r.annee, r.mois);
  const jours = {}; const ateStat = {}; const persStat = {};
  const semBrut = Array.from({ length: 7 }, () => ({ saisies: 0, abs: 0 }));

  r.presences.forEach((p) => {
    const s = parId[p.statut_id];
    const k = String(p.jour).slice(0, 7);
    const mm = parCle[k];
    if (!s || !mm) return;
    const estP = p.statut_id === idP;
    mm.saisies++; if (estP) mm.presents++;
    mm.cpt[s.id] = (mm.cpt[s.id] || 0) + 1;
    mm.jours.add(p.jour);
    const g = dateDepuisISO(p.jour).getDay();
    semBrut[g].saisies++; if (!estP) semBrut[g].abs++;
    if (k !== cible) return;
    const j = jours[p.jour] || (jours[p.jour] = { iso: p.jour, saisies: 0, presents: 0 });
    j.saisies++; if (estP) j.presents++;
    const at = atelierDe[p.travailleur_id];
    const a = ateStat[at] || (ateStat[at] = { saisies: 0, presents: 0, cpt: {} });
    a.saisies++; if (estP) a.presents++; a.cpt[s.id] = (a.cpt[s.id] || 0) + 1;
    if (!estP) {
      const q = persStat[p.travailleur_id] || (persStat[p.travailleur_id] = { abs: 0, cpt: {} });
      q.abs++; q.cpt[s.id] = (q.cpt[s.id] || 0) + 1;
    }
  });
  mois6.forEach((x) => { x.taux = x.saisies ? x.presents / x.saisies : null; });
  const idxMois = mois6.length - 1;
  const courant = mois6[idxMois]; const precedent = mois6[idxMois - 1];

  const listeJours = Object.values(jours).sort((a, b) => a.iso.localeCompare(b.iso)).map((j) => ({ ...j, taux: j.presents / j.saisies }));

  // Ateliers : taux et saisie validée
  const valides = new Set(r.validees.filter((v) => String(v.jour).slice(0, 7) === cible).map((v) => v.atelier_id + '|' + v.jour));
  const joursActifs = Object.keys(jours).sort();
  const ateliersStats = r.ateliers.map((a) => {
    const s = ateStat[a.id] || { saisies: 0, presents: 0, cpt: {} };
    const effectif = r.travailleurs.filter((w) => w.atelier_id === a.id && w.actif).length;
    const attendues = effectif > 0 ? joursActifs : [];
    const nonValidees = attendues.filter((j) => !valides.has(a.id + '|' + j));
    return { id: a.id, nom: a.nom, effectif, saisies: s.saisies, presents: s.presents, cpt: s.cpt, taux: s.saisies ? s.presents / s.saisies : null, attendues: attendues.length, nonValidees: nonValidees.length };
  }).sort((a, b) => (b.taux == null ? -1 : b.taux) - (a.taux == null ? -1 : a.taux) || a.nom.localeCompare(b.nom, 'fr'));
  const attendues = ateliersStats.reduce((t, a) => t + a.attendues, 0);
  const nonValidees = ateliersStats.reduce((t, a) => t + a.nonValidees, 0);

  // Jours de semaine
  const ordre = [[1, 'lun.', 'Lundi'], [2, 'mar.', 'Mardi'], [3, 'mer.', 'Mercredi'], [4, 'jeu.', 'Jeudi'], [5, 'ven.', 'Vendredi'], [6, 'sam.', 'Samedi'], [0, 'dim.', 'Dimanche']];
  const semaine = ordre.filter(([g]) => g >= 1 && g <= 5 || semBrut[g].saisies > 0)
    .map(([g, nom, long]) => ({ nom, long, saisies: semBrut[g].saisies, abs: semBrut[g].abs, taux: semBrut[g].saisies ? semBrut[g].abs / semBrut[g].saisies : 0 }));

  // Travailleurs à suivre
  const suivi = Object.entries(persStat).map(([id, q]) => {
    const w = persDe[id]; if (!w) return null;
    const dom = Object.entries(q.cpt).sort((a, b) => b[1] - a[1])[0];
    const ate = r.ateliers.find((a) => a.id === w.atelier_id);
    const sDom = dom ? parId[dom[0]] : null;
    return { nom: w.prenom + ' ' + w.nom, atelier: ate ? ate.nom : '', abs: q.abs, motif: sDom ? (sDom === statutA ? 'Non précisé' : sDom.nom) : '' };
  }).filter(Boolean).sort((a, b) => b.abs - a.abs || a.nom.localeCompare(b.nom, 'fr')).slice(0, 6);

  // Jours du lundi au vendredi sans aucune saisie (déjà passés)
  const auj = aujourdhuiISO();
  const sansSaisie = [];
  for (let j = 1; j <= nbJours(r.annee, r.mois); j++) {
    const iso = isoJour(r.annee, r.mois, j);
    const g = new Date(r.annee, r.mois, j).getDay();
    if (iso < auj && g >= 1 && g <= 5 && !jours[iso] && !(r.fermes && r.fermes[iso])) sansSaisie.push(iso);
  }

  const now = new Date();
  const termine = r.annee < now.getFullYear() || (r.annee === now.getFullYear() && r.mois < now.getMonth());
  const premier = premierDuMois(r.annee, r.mois);

  return {
    ...r, mois6, idxMois, courant, precedent, statutP, statutA, statutsAbs, couleurP: statutP ? statutP.couleur : '#2F7B3A', couleurA: statutA ? statutA.couleur : '#B34700',
    jours: listeJours, ateliersStats, attendues, nonValidees, semaine, suivi, sansSaisie, termine, premier,
    cloture: r.clotures[premier] || null,
    nbAbs: courant.saisies - courant.presents, nbAbsPrec: precedent ? precedent.saisies - precedent.presents : null
  };
}

function phrasesCles(c) {
  const p = [];
  const mc = c.courant; const lib = minuscule(libelleMois(c.annee, c.mois));
  if (!mc.saisies) return ['Aucune présence n’a été saisie en ' + lib + ' pour le moment.'];
  let t = 'En ' + lib + ', le taux de présence est de ' + pct(mc.taux, 0) + ' (' + nf(mc.presents) + ' journées de présence sur ' + nf(mc.saisies) + ' renseignées)';
  if (c.precedent && c.precedent.taux != null) {
    const ecart = (mc.taux - c.precedent.taux) * 100;
    t += Math.abs(ecart) < 0.5 ? ', stable par rapport au mois précédent.' : ', ' + (ecart > 0 ? 'en hausse' : 'en baisse') + ' de ' + nf(Math.abs(ecart), 1) + ' point' + (Math.abs(ecart) >= 2 ? 's' : '') + ' par rapport au mois précédent.';
  } else t += '.';
  p.push(t);
  const tousAbs = c.semaine.reduce((x, q) => x + q.abs, 0); const tousSaisies = c.semaine.reduce((x, q) => x + q.saisies, 0);
  if (tousSaisies >= 40 && tousAbs >= 8) {
    const moy = tousAbs / tousSaisies;
    const top = c.semaine.reduce((a, b) => (b.taux > a.taux ? b : a));
    if (top.taux >= moy * 1.25 && top.saisies >= 10) p.push('Sur six mois, le ' + top.long.toLowerCase() + ' est le jour le plus touché par les absences (' + pct(top.taux, 0) + ' des saisies, contre ' + pct(moy, 0) + ' en moyenne).');
  }
  const avecTaux = c.ateliersStats.filter((a) => a.taux != null);
  if (avecTaux.length >= 2) {
    const bas = avecTaux[avecTaux.length - 1]; const haut = avecTaux[0];
    if ((haut.taux - bas.taux) * 100 >= 5) p.push('L’atelier « ' + bas.nom + ' » a le taux de présence le plus bas du mois (' + pct(bas.taux, 0) + '), contre ' + pct(haut.taux, 0) + ' pour « ' + haut.nom + ' ».');
  }
  if (c.nonValidees > 0) p.push(nf(c.nonValidees) + ' journée' + (c.nonValidees > 1 ? 's' : '') + ' d’atelier ' + (c.nonValidees > 1 ? 'restent' : 'reste') + ' à valider par les moniteurs.');
  return p;
}

// ---------------------------------------------------------------------
// Clôture / réouverture
// ---------------------------------------------------------------------
async function cloturerMois(c) {
  const r = S.r;
  const { error } = await sb.from('mois_clotures').insert({ esat_id: S.profil.esat_id, mois: c.premier, cloture_par: S.user.id });
  r.confirmer = null;
  if (error) r.err = 'Clôture impossible : ' + error.message;
  else { r.clotures[c.premier] = new Date().toISOString(); r.err = ''; r.msg = libelleMois(c.annee, c.mois) + ' est clôturé. Plus personne ne peut modifier ses présences.'; }
  vueReporting();
}

async function rouvrirMois(c) {
  const r = S.r;
  const { error } = await sb.from('mois_clotures').delete().eq('esat_id', S.profil.esat_id).eq('mois', c.premier);
  r.confirmer = null;
  if (error) r.err = 'Réouverture impossible : ' + error.message;
  else { delete r.clotures[c.premier]; r.err = ''; r.msg = libelleMois(c.annee, c.mois) + ' est rouvert : les présences peuvent de nouveau être modifiées.'; }
  vueReporting();
}

function blocCloture(c) {
  const r = S.r;
  const lib = libelleMois(c.annee, c.mois);
  const dateCl = c.cloture && c.cloture !== true ? new Date(c.cloture).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const pointsAttention = [];
  if (c.nonValidees > 0) pointsAttention.push(nf(c.nonValidees) + ' journée' + (c.nonValidees > 1 ? 's' : '') + ' d’atelier non validée' + (c.nonValidees > 1 ? 's' : ''));
  if (c.sansSaisie.length > 0) pointsAttention.push(nf(c.sansSaisie.length) + ' jour' + (c.sansSaisie.length > 1 ? 's' : '') + ' ouvré' + (c.sansSaisie.length > 1 ? 's' : '') + ' sans aucune saisie (' + c.sansSaisie.slice(0, 4).map((i) => +i.slice(8)).join(', ') + (c.sansSaisie.length > 4 ? '…' : '') + ') : jours fériés ou oubli ?');
  const historique = Object.keys(r.clotures).sort().reverse().slice(0, 6).map((k) => h('span', { class: 'tag' }, libelleMois(+k.slice(0, 4), +k.slice(5, 7) - 1)));

  let corps;
  if (r.clotureIndispo) {
    corps = [h('p', {}, 'La clôture de mois n’est pas encore activée sur votre base de données.'),
      h('p', { class: 'muted' }, 'Éditeur : exécutez le fichier atelio-cloture.sql dans Supabase (SQL Editor), puis rechargez la page.')];
  } else if (c.cloture) {
    corps = [h('p', {}, h('strong', {}, 'Mois clôturé'), dateCl ? ' le ' + dateCl : '', '. Les présences de ' + minuscule(lib) + ' ne peuvent plus être modifiées, ni par les moniteurs ni par la direction.'),
      r.confirmer === 'rouvrir'
        ? h('div', { class: 'stack', style: 'gap:10px' },
            h('p', { role: 'alert' }, 'Rouvrir ' + minuscule(lib) + ' permet de nouveau de modifier ses présences. Pensez à le clôturer à nouveau après vos corrections.'),
            h('div', { class: 'row', style: 'justify-content:flex-start' },
              h('button', { type: 'button', class: 'primary', onClick: () => rouvrirMois(c) }, 'Oui, rouvrir ce mois'),
              h('button', { type: 'button', class: 'secondary', onClick: () => { r.confirmer = null; vueReporting(); } }, 'Annuler')))
        : h('div', {}, h('button', { type: 'button', class: 'secondary', onClick: () => { r.confirmer = 'rouvrir'; r.msg = ''; vueReporting(); } }, 'Rouvrir ce mois'))];
  } else if (!c.termine) {
    corps = [h('p', {}, lib + ' n’est pas terminé : vous pourrez le clôturer à partir du 1er ' + minuscule(libelleMois(new Date(c.annee, c.mois + 1, 1).getFullYear(), new Date(c.annee, c.mois + 1, 1).getMonth())) + '.'),
      h('p', { class: 'muted' }, 'Clôturer un mois fige ses présences : une fois les paies faites, plus aucune modification n’est possible par erreur.')];
  } else {
    corps = [
      h('p', {}, 'Une fois les présences vérifiées et la paie préparée, clôturez ' + minuscule(lib) + ' : plus personne ne pourra modifier ses présences. Vous pourrez le rouvrir en cas de besoin.'),
      pointsAttention.length
        ? h('div', { class: 'stack', style: 'gap:6px' }, h('strong', {}, 'À vérifier avant de clôturer'), h('ul', { class: 'list', style: 'gap:4px;font-weight:430' }, pointsAttention.map((t) => h('li', {}, '• ' + t))))
        : h('p', { class: 'ok' }, '✓ Toutes les journées sont validées, rien à signaler.'),
      r.confirmer === 'cloturer'
        ? h('div', { class: 'stack', style: 'gap:10px' },
            h('p', { role: 'alert' }, pointsAttention.length ? 'Il reste des points à vérifier. Clôturer ' + minuscule(lib) + ' malgré tout ?' : 'Clôturer ' + minuscule(lib) + ' ?'),
            h('div', { class: 'row', style: 'justify-content:flex-start' },
              h('button', { type: 'button', class: 'primary', onClick: () => cloturerMois(c) }, 'Oui, clôturer ' + minuscule(lib)),
              h('button', { type: 'button', class: 'secondary', onClick: () => { r.confirmer = null; vueReporting(); } }, 'Annuler')))
        : h('div', {}, h('button', { type: 'button', class: 'primary', onClick: () => { r.confirmer = 'cloturer'; r.msg = ''; vueReporting(); } }, 'Clôturer ' + minuscule(lib)))
    ];
  }
  const verrou = c.cloture && !r.clotureIndispo;
  return h('section', { class: 'card stack cloture' + (verrou ? ' fermee' : ''), 'aria-labelledby': 't-cloture' },
    h('div', { class: 'row' },
      h('h2', { id: 't-cloture' }, 'Clôture du mois'),
      h('span', { class: 'tag' + (verrou ? ' verr' : '') }, r.clotureIndispo ? 'Indisponible' : (verrou ? '🔒 Clôturé' : (c.termine ? 'Ouvert' : 'En cours')))),
    r.err ? h('p', { class: 'err', role: 'alert' }, r.err) : null,
    r.msg ? h('p', { class: 'ok', role: 'status' }, r.msg) : null,
    corps,
    historique.length ? h('div', { class: 'stack', style: 'gap:8px' }, h('span', { class: 'muted' }, 'Derniers mois clôturés'), h('div', { class: 'chips' }, historique)) : null);
}

// ---------------------------------------------------------------------
// La page
// ---------------------------------------------------------------------
function tuile(libelle, valeur, delta, courbe, hero) {
  return h('div', { class: 'kpi' + (hero ? ' hero' : '') },
    h('span', { class: 'kpi-l' }, libelle),
    h('span', { class: 'kpi-v' }, valeur),
    delta ? h('span', { class: 'kpi-d ' + delta.sens }, delta.texte) : h('span', { class: 'kpi-d neutre' }, ' '),
    courbe || null);
}

function deltaTexte(ecart, unite, montePositif, precedentLib, decimales) {
  if (ecart == null) return null;
  if (Math.abs(ecart) < (decimales ? 0.05 : 0.5)) return { sens: 'neutre', texte: '→ stable vs ' + precedentLib };
  const bon = (ecart > 0) === montePositif;
  return { sens: bon ? 'bon' : 'mauvais', texte: (ecart > 0 ? '▲ +' : '▼ −') + nf(Math.abs(ecart), decimales || 0) + unite + ' vs ' + precedentLib };
}

function vueReporting() {
  const r = S.r;
  const c = calculerReporting(r);
  r.calc = c;
  const lib = libelleMois(c.annee, c.mois);
  const prevLib = c.precedent ? moisCourt(c.precedent.a, c.precedent.m, false) : '';
  const mc = c.courant;
  const maintenant = new Date();
  const dernierMois = c.annee === maintenant.getFullYear() && c.mois === maintenant.getMonth();
  const decaler = (delta) => { const dt = new Date(c.annee, c.mois + delta, 1); chargerReporting({ annee: dt.getFullYear(), mois: dt.getMonth() }); };

  const phrases = phrasesCles(c);
  const kpis = h('div', { class: 'kpis' },
    tuile('Taux de présence', mc.taux == null ? '—' : pct(mc.taux, 0),
      mc.taux != null && c.precedent && c.precedent.taux != null ? deltaTexte((mc.taux - c.precedent.taux) * 100, ' pt', true, prevLib, 1) : null,
      miniCourbe(c.mois6.map((x) => x.taux), couleurSure(c.couleurP)), true),
    tuile('Journées de présence', nf(mc.presents),
      c.termine && c.precedent && c.precedent.saisies ? deltaTexte(mc.presents - c.precedent.presents, '', true, prevLib, 0) : (c.termine ? null : { sens: 'neutre', texte: 'mois en cours' }),
      miniCourbe(c.mois6.map((x) => (x.saisies ? x.presents : null)), couleurSure(c.couleurP))),
    tuile('Journées d’absence', nf(c.nbAbs),
      c.termine && c.nbAbsPrec != null && c.precedent.saisies ? deltaTexte(c.nbAbs - c.nbAbsPrec, '', false, prevLib, 0) : (c.termine ? null : { sens: 'neutre', texte: 'mois en cours' }),
      miniCourbe(c.mois6.map((x) => (x.saisies ? x.saisies - x.presents : null)), couleurSure(c.couleurA))),
    tuile('Journées validées', c.attendues ? pct((c.attendues - c.nonValidees) / c.attendues, 0) : '—',
      c.attendues ? { sens: c.nonValidees ? 'mauvais' : 'bon', texte: c.nonValidees ? nf(c.nonValidees) + ' à valider' : '✓ tout est validé' } : null, null));

  const carte = (titre, sous, contenu, extra, classe) => h('section', { class: 'card g ' + (classe || 'c6') },
    h('div', { class: 'stack', style: 'gap:2px' }, h('h3', {}, titre), h('p', { class: 'muted' }, sous)), contenu, extra || null);

  const statutsAvecP = [c.statutP].concat(c.statutsAbs);
  const joursTable = donnees(['Jour', 'Présents', 'Renseignés', 'Taux de présence'], c.jours.map((j) => [jourCourt(j.iso), nf(j.presents), nf(j.saisies), pct(j.taux, 0)]));
  const tendanceTable = donnees(['Mois', 'Taux de présence', 'Présents', 'Saisies'], c.mois6.map((x) => [libelleMois(x.a, x.m), x.taux == null ? '—' : pct(x.taux, 1), nf(x.presents), nf(x.saisies)]));
  const absTable = donnees(['Mois'].concat(c.statutsAbs.map((s) => s.nom), ['Total']), c.mois6.map((x) =>
    [libelleMois(x.a, x.m)].concat(c.statutsAbs.map((s) => nf(x.cpt[s.id] || 0)), [nf(c.statutsAbs.reduce((t, s) => t + (x.cpt[s.id] || 0), 0))])));
  const atelierTable = donnees(['Atelier', 'Taux de présence'].concat(statutsAvecP.map((s) => s.nom + ' (jours)')), c.ateliersStats.map((a) =>
    [a.nom, a.taux == null ? '—' : pct(a.taux, 0)].concat(statutsAvecP.map((s) => nf(a.cpt[s.id] || 0)))));
  const semaineTable = donnees(['Jour', 'Absences', 'Saisies', 'Taux d’absence'], c.semaine.map((q) => [q.long, nf(q.abs), nf(q.saisies), pct(q.taux, 1)]));

  const vide = !mc.saisies;
  const graphes = vide
    ? h('section', { class: 'card' }, h('p', {}, 'Aucune présence n’a été saisie en ' + minuscule(lib) + '. Les graphiques apparaîtront dès les premières saisies des moniteurs.'))
    : h('div', { class: 'rgrid' },
        carte('Taux de présence par jour', lib + ' · jours avec saisie', grapheJours(c), joursTable, 'c8'),
        carte('Répartition des statuts', 'Tous ateliers · ' + minuscule(lib), h('div', { class: 'stack' },
          repartitionGlobale(c, statutsAvecP)), null, 'c4'),
        carte('Comparaison des ateliers', 'Part de chaque statut · ' + minuscule(lib) + ' · trié par taux de présence', grapheAteliers(c), h('div', { class: 'stack' }, legendeStatuts(statutsAvecP), atelierTable), 'c12'),
        carte('Évolution du taux de présence', '6 derniers mois', grapheTendance(c), tendanceTable, 'c6'),
        carte('Absences par motif', 'Jours d’absence, 6 derniers mois', grapheAbsencesMois(c), h('div', { class: 'stack' }, legendeStatuts(c.statutsAbs), absTable), 'c6'),
        carte('Absences selon le jour de la semaine', 'Part des saisies en absence · 6 derniers mois', grapheSemaine(c), semaineTable, 'c6'),
        carte('Personnes à accompagner', 'Les plus de jours d’absence en ' + minuscule(lib), tableauSuivi(c), null, 'c6'));

  render(pageAvec([
    h('div', { class: 'noprint' }, navPrincipale('reporting')),
    h('div', { class: 'rapport', style: couleurMarque() ? '--marque:' + couleurMarque() : null },
      S.marque && logoSur(S.marque.logo) ? h('div', { class: 'print-only' }, h('img', { class: 'fiche-logo', src: logoSur(S.marque.logo), alt: '' })) : null,
      h('div', { class: 'stack', style: 'gap:6px' },
        h('p', { class: 'muted' }, r.esat),
        h('h1', {}, 'Reporting · ', h('em', {}, lib))),
      h('div', { class: 'row noprint' },
        h('div', { class: 'row', style: 'justify-content:flex-start' },
          h('button', { type: 'button', class: 'secondary', 'aria-label': 'Mois précédent', onClick: () => decaler(-1) }, '‹ Précédent'),
          h('h2', { style: 'min-width:170px;text-align:center', 'aria-live': 'polite' }, lib),
          h('button', { type: 'button', class: 'secondary', 'aria-label': 'Mois suivant', disabled: dernierMois, onClick: () => decaler(1) }, 'Suivant ›')),
        h('button', { type: 'button', class: 'secondary', onClick: () => window.print() }, 'Imprimer / PDF')),
      c.cloture && !r.clotureIndispo ? h('p', { class: 'verrou-ligne' }, '🔒 Mois clôturé : les présences ne sont plus modifiables.') : null,
      phrases.length ? h('section', { class: 'banner stack', 'aria-labelledby': 't-cles', style: 'align-items:flex-start' },
        h('h2', { id: 't-cles' }, 'À retenir'),
        h('ul', { class: 'list', style: 'gap:8px;font-weight:430;font-size:18px' }, phrases.map((t) => h('li', {}, '• ' + t)))) : null,
      kpis,
      graphes,
      h('div', { class: 'noprint' }, blocCloture(c)),
      h('p', { class: 'muted' }, 'Définitions : taux de présence = journées « Présent » ÷ journées renseignées. Seuls les jours où au moins une personne a été renseignée comptent. Les journées d’atelier à valider = jours avec saisie × ateliers ayant des travailleurs actifs.'))
  ], true));
}

function repartitionGlobale(c, statuts) {
  const total = c.courant.saisies;
  const barre = graphique((w, o) => {
    const H = 34; const svg = sv('svg', { width: w, height: H, viewBox: `0 0 ${w} ${H}`, class: 'svg' });
    const segs = statuts.map((s) => ({ s, n: c.courant.cpt[s.id] || 0 })).filter((q) => q.n > 0);
    let x = 0;
    segs.forEach((q, k) => {
      const part = q.n / total; const lw = Math.max(1, part * w - (k < segs.length - 1 ? 2 : 0));
      const fond = couleurSure(q.s.couleur);
      const el = k === segs.length - 1 ? sv('path', { d: rectBout(x, 6, lw, 22, 'droite'), fill: fond }) : sv('rect', { x, y: 6, width: lw, height: 22, fill: fond });
      sensible(el, (px, py) => o.montrer(px, py, q.s.nom, [{ couleur: fond, valeur: nf(q.n), libelle: 'jours (' + pct(part, 1) + ')' }]), o);
      el.setAttribute('aria-label', q.s.nom + ' : ' + nf(q.n) + ' (' + pct(part, 1) + ')');
      svg.append(el);
      if (lw >= 34) svg.append(sv('text', { x: x + lw / 2, y: 21, 'text-anchor': 'middle', class: 'seg', fill: texteSurFond(fond), 'pointer-events': 'none' }, q.s.code));
      x += part * w;
    });
    return svg;
  }, 'Répartition des statuts : ' + statuts.map((s) => s.nom + ' ' + (c.courant.cpt[s.id] || 0)).join(', '));
  const liste = h('ul', { class: 'repart' }, statuts.map((s) => {
    const n = c.courant.cpt[s.id] || 0;
    return h('li', {}, h('i', { style: 'background:' + couleurSure(s.couleur) }), h('span', { class: 'rn' }, s.nom), h('strong', {}, nf(n)), h('span', { class: 'muted' }, pct(total ? n / total : 0, 0)));
  }));
  return [barre, liste];
}

function tableauSuivi(c) {
  if (!c.suivi.length) return h('p', { class: 'muted' }, 'Aucune absence enregistrée ce mois-ci.');
  return h('div', { class: 'scroll' }, h('table', { class: 'tbl' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Personne'), h('th', {}, 'Atelier'), h('th', {}, 'Jours d’absence'), h('th', {}, 'Motif principal'))),
    h('tbody', {}, c.suivi.map((q) => h('tr', {}, h('td', {}, q.nom), h('td', {}, q.atelier), h('td', {}, h('strong', {}, nf(q.abs))), h('td', {}, q.motif))))));
}

// ---------------------------------------------------------------------
// V21 : IDENTITÉ DE L'ESAT, PLANNING, JOURNAL, AIDE
// ---------------------------------------------------------------------
const APP_VERSION = 'V23';

// ---------------------------------------------------------------------
// V23 : HORAIRES DES TRAVAILLEURS (journée entière, matin, après-midi, jours non travaillés)
// Texte de 5 lettres, du lundi au vendredi : J = journée, M = matin, A = après-midi, - = ne travaille pas.
// ---------------------------------------------------------------------
const HORAIRES_DEFAUT = 'JJJJJ';
const JOURS_OUVRES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
const CRENEAUX = [['J', 'Journée'], ['M', 'Matin'], ['A', 'Après-midi'], ['-', 'Ne travaille pas']];
const horairesDe = (w) => (w && typeof w.horaires === 'string' && /^[JMA-]{5}$/.test(w.horaires) ? w.horaires : HORAIRES_DEFAUT);
// Créneau d'un travailleur un jour donné : 'J', 'M', 'A' ou '' (ne travaille pas). Le week-end n'a pas d'horaire : on ne change rien.
function creneau(w, iso) {
  const g = dateDepuisISO(iso).getDay();
  if (g < 1 || g > 5) return 'J';
  const c = horairesDe(w)[g - 1];
  return c === '-' ? '' : c;
}
const LIBELLE_CRENEAU = { J: 'Journée', M: 'Matin', A: 'Après-midi' };
function resumeHoraires(hr) {
  if (hr === HORAIRES_DEFAUT) return 'Temps plein (lundi au vendredi)';
  const jc = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven'];
  const parts = [];
  [['J', 'Journée'], ['M', 'Matin'], ['A', 'Après-midi']].forEach(([k, lib]) => {
    const j = jc.filter((_, i) => hr[i] === k);
    if (j.length) parts.push(lib + ' : ' + j.join(', '));
  });
  const non = jc.filter((_, i) => hr[i] === '-');
  if (non.length) parts.push('Ne travaille pas : ' + non.join(', '));
  return parts.join(' · ');
}
// Petit éditeur : une liste par jour + modèles rapides. get/set lisent et écrivent la valeur de 5 lettres.
function editeurHoraires(valeur, onChange, prefixe) {
  const vals = valeur.split('');
  const selects = JOURS_OUVRES.map((nom, i) => {
    const id = prefixe + '-j' + i;
    const sel = h('select', { id, class: 'in', onChange: (e) => { vals[i] = e.target.value; onChange(vals.join('')); } },
      CRENEAUX.map(([k, lib]) => h('option', { value: k }, lib)));
    sel.value = vals[i];
    return h('div', { style: 'flex:1 1 130px' }, h('label', { class: 'lbl', for: id }, nom), sel);
  });
  const modele = (texte, v) => h('button', { type: 'button', class: 'linkbtn', onClick: () => onChange(v, true) }, texte);
  return h('div', { class: 'stack', style: 'gap:10px' },
    h('div', { class: 'fields' }, selects),
    h('div', { class: 'row', style: 'justify-content:flex-start;gap:14px' },
      h('span', { class: 'muted' }, 'Modèles :'),
      modele('Temps plein', 'JJJJJ'), modele('Tous les matins', 'MMMMM'), modele('Tous les après-midis', 'AAAAA'),
      modele('Lundi au jeudi', 'JJJJ-')));
}

const MAIL_OK = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
// Adresse de support : fournie par la base (moniteur -> son administrateur ; administrateur -> l'éditeur)
async function lireSupport() {
  try {
    const { data, error } = await sb.rpc('adresse_support');
    return !error && typeof data === 'string' && MAIL_OK.test(data) ? data : '';
  } catch (e) { return ''; }
}
const LOGO_OK = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/;
const logoSur = (s) => (typeof s === 'string' && s.length < 450000 && LOGO_OK.test(s) ? s : '');
const couleurMarque = () => (S.marque && /^#[0-9A-Fa-f]{6}$/.test(S.marque.couleur || '') ? S.marque.couleur : null);
const isoDe = (dt) => isoJour(dt.getFullYear(), dt.getMonth(), dt.getDate());

async function chargerMarque() {
  S.marque = null;
  if (!S.profil || !S.profil.esat_id) return;
  try {
    const { data, error } = await sb.from('esats').select('nom, logo, couleur').eq('id', S.profil.esat_id).maybeSingle();
    if (!error && data) S.marque = data;
  } catch (e) { /* sans logo : l'application fonctionne quand même */ }
}

// ---------------------------------------------------------------------
// PARAMÈTRES : logo et couleur de l'ESAT, maquette de base
// ---------------------------------------------------------------------
function lireLogo(fichier) {
  return new Promise((resolve, reject) => {
    if (!fichier || !/^image\/(png|jpeg)$/.test(fichier.type)) return reject(new Error('Choisissez une image PNG ou JPEG.'));
    if (fichier.size > 5 * 1024 * 1024) return reject(new Error('Image trop lourde (5 Mo maximum).'));
    const lecteur = new FileReader();
    lecteur.onerror = () => reject(new Error('Lecture du fichier impossible.'));
    lecteur.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Image illisible.'));
      img.onload = () => {
        const k = Math.min(1, 480 / img.width, 200 / img.height);
        const w = Math.max(1, Math.round(img.width * k)); const hh = Math.max(1, Math.round(img.height * k));
        const cv = document.createElement('canvas'); cv.width = w; cv.height = hh;
        const cx = cv.getContext('2d');
        let sortie = null;
        if (fichier.type === 'image/png') { cx.drawImage(img, 0, 0, w, hh); sortie = cv.toDataURL('image/png'); }
        if (!sortie || sortie.length > 200000) { cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, hh); cx.drawImage(img, 0, 0, w, hh); sortie = cv.toDataURL('image/jpeg', 0.85); }
        if (sortie.length > 380000) return reject(new Error('Image trop détaillée : choisissez un logo plus simple.'));
        resolve(sortie);
      };
      img.src = lecteur.result;
    };
    lecteur.readAsDataURL(fichier);
  });
}

async function chargerParametres() {
  render(pageAvec([h('div', { class: 'noprint' }, navPrincipale('parametres')), h('p', { class: 'muted' }, 'Chargement…')], true));
  await chargerMarque();
  let sup = '';
  try { const r = await sb.from('esats').select('email_support').eq('id', S.profil.esat_id).maybeSingle(); if (!r.error && r.data) sup = r.data.email_support || ''; } catch (e) { /* colonne absente : V22 pas encore lancé */ }
  S.p = { logo: (S.marque && logoSur(S.marque.logo)) || '', couleur: (S.marque && S.marque.couleur) || '', support: sup, msg: '', err: '' };
  vueParametres();
}

async function enregistrerSupport() {
  const p = S.p; const v = (p.support || '').trim();
  if (v && !MAIL_OK.test(v)) { p.msg = ''; p.err = 'Adresse e-mail invalide.'; return vueParametres(); }
  const { error } = await sb.rpc('maj_support_esat', { p_email: v || null });
  if (error) {
    p.msg = '';
    p.err = /maj_support|does not exist|schema cache/i.test(error.message)
      ? 'Cette option n’est pas encore activée : l’éditeur doit exécuter le fichier atelio-v22.sql.'
      : 'Enregistrement impossible : ' + error.message;
  } else {
    p.err = ''; p.support = v;
    p.msg = v ? 'Adresse de support enregistrée.' : 'Adresse retirée : vos moniteurs verront votre adresse de compte.';
  }
  vueParametres();
}

async function enregistrerMarque() {
  const p = S.p;
  const { error } = await sb.rpc('maj_marque', { p_logo: p.logo || null, p_couleur: p.couleur || null });
  if (error) {
    p.msg = '';
    p.err = /maj_marque|does not exist|schema cache/i.test(error.message)
      ? 'Cette option n’est pas encore activée sur votre base de données : l’éditeur doit exécuter le fichier atelio-v21.sql.'
      : 'Enregistrement impossible : ' + error.message;
  } else {
    S.marque = { ...(S.marque || {}), logo: p.logo || null, couleur: p.couleur || null };
    p.err = '';
    p.msg = 'Identité enregistrée. Elle apparaît dans l’en-tête, sur les fiches mensuelles, dans les exports Excel et sur la maquette.';
  }
  vueParametres();
}

function vueParametres() {
  const p = S.p;
  const nom = (S.marque && S.marque.nom) || '';
  const apercu = h('div', { class: 'apercu-logo' }, p.logo
    ? h('img', { src: p.logo, alt: 'Logo de l’ESAT' })
    : h('span', { class: 'muted' }, 'Aucun logo pour l’instant'));
  const fichier = h('input', {
    id: 'fichierLogo', type: 'file', accept: 'image/png,image/jpeg', class: 'sr',
    onChange: async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      try { p.logo = await lireLogo(f); p.err = ''; p.msg = ''; } catch (er) { p.err = er.message; p.msg = ''; }
      vueParametres();
    }
  });
  const pastilles = COULEURS.map((c) => h('button', {
    type: 'button', class: 'sw' + (p.couleur.toLowerCase() === c.hex.toLowerCase() ? ' on' : ''), style: '--c:' + c.hex,
    title: c.nom, 'aria-label': c.nom, 'aria-pressed': String(p.couleur.toLowerCase() === c.hex.toLowerCase()),
    onClick: () => { p.couleur = c.hex; p.msg = ''; vueParametres(); }
  }));
  render(pageAvec([
    h('div', { class: 'noprint' }, navPrincipale('parametres')),
    h('div', { class: 'stack', style: 'gap:6px' }, h('p', { class: 'muted' }, nom), h('h1', {}, 'Paramètres')),
    p.err ? h('p', { class: 'err', role: 'alert' }, p.err) : null,
    p.msg ? h('p', { class: 'ok', role: 'status' }, p.msg) : null,
    h('section', { class: 'card stack', 'aria-labelledby': 't-ident' },
      h('h2', { id: 't-ident' }, 'Identité de l’ESAT'),
      h('p', { class: 'muted' }, 'Le logo et la couleur personnalisent l’en-tête de l’application, les fiches mensuelles, les exports Excel et la maquette de feuille de présence.'),
      h('div', { class: 'row', style: 'justify-content:flex-start;align-items:center;gap:20px' },
        apercu,
        h('div', { class: 'stack', style: 'gap:10px' },
          fichier,
          h('div', { class: 'row', style: 'justify-content:flex-start' },
            h('label', { for: 'fichierLogo', class: 'secondary btnlabel', tabindex: '0',
              onKeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fichier.click(); } } }, p.logo ? 'Changer le logo' : 'Choisir un logo'),
            p.logo ? h('button', { type: 'button', class: 'linkbtn', onClick: () => { p.logo = ''; p.msg = ''; vueParametres(); } }, 'Retirer le logo') : null),
          h('p', { class: 'muted', style: 'font-size:14px' }, 'PNG ou JPEG. L’image est réduite automatiquement ; un logo sur fond transparent ou blanc rend mieux.'))),
      h('div', { class: 'stack', style: 'gap:8px' },
        h('span', { class: 'lbl' }, 'Couleur de l’ESAT'),
        h('div', { class: 'swatches', role: 'group', 'aria-label': 'Couleur de l’ESAT' }, pastilles,
          p.couleur ? h('button', { type: 'button', class: 'linkbtn', onClick: () => { p.couleur = ''; p.msg = ''; vueParametres(); } }, 'Aucune couleur') : null)),
      h('div', {}, h('button', { type: 'button', class: 'primary', onClick: enregistrerMarque }, 'Enregistrer l’identité'))),
    h('section', { class: 'card stack', 'aria-labelledby': 't-sup' },
      h('h2', { id: 't-sup' }, 'Adresse de support de vos moniteurs'),
      h('p', { class: 'muted' }, 'Dans « Aide et support », vos moniteurs peuvent écrire à cette adresse. Si vous la laissez vide, ils écrivent à l’adresse de connexion d’un administrateur de l’ESAT.'),
      h('div', {}, h('label', { class: 'lbl', for: 'supEsat' }, 'Adresse e-mail'),
        h('input', { id: 'supEsat', type: 'email', autocomplete: 'off', placeholder: 'ex. direction@monesat.fr', value: p.support || '',
          onInput: (e) => { p.support = e.target.value; } })),
      h('div', {}, h('button', { type: 'button', class: 'primary', onClick: enregistrerSupport }, 'Enregistrer l’adresse'))),
    h('section', { class: 'card stack', 'aria-labelledby': 't-maq' },
      h('h2', { id: 't-maq' }, 'Maquette de base'),
      h('p', { class: 'muted' }, 'Créez une feuille de présence mensuelle vierge à l’en-tête de votre ESAT (logo, nom, couleur), à imprimer ou à enregistrer en PDF. Vous pouvez la pré-remplir avec les travailleurs d’un atelier.'),
      h('div', {}, h('button', { type: 'button', class: 'secondary', onClick: () => chargerMaquette() }, 'Créer une maquette de base')))
  ], true));
}

async function chargerMaquette() {
  const p = S.profil;
  const [at, tr, st] = await Promise.all([
    sb.from('ateliers').select('id, nom').eq('esat_id', p.esat_id).order('nom'),
    sb.from('travailleurs').select('id, prenom, nom, atelier_id, actif').eq('esat_id', p.esat_id).order('nom'),
    sb.from('statuts').select('id, code, nom, couleur, ordre, esat_id').order('ordre').order('code')
  ]);
  const ko = [at, tr, st].find((x) => x.error);
  if (ko) return vueMessage('Chargement impossible', ko.error.message);
  const now = new Date();
  S.q = { ateliers: at.data, travailleurs: tr.data, statuts: st.data, atelier: '', mois: now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0'), lignes: 20, avecMois: true };
  vueMaquette();
}

function vueMaquette() {
  const q = S.q;
  const marque = S.marque || {};
  const couleur = couleurMarque() || '#17191c';
  const [aa, mm] = q.mois ? q.mois.split('-').map(Number) : [0, 0];
  const nbJ = q.avecMois && aa ? nbJours(aa, mm - 1) : 31;
  const atelier = q.ateliers.find((a) => a.id === q.atelier);
  const gens = atelier ? q.travailleurs.filter((w) => w.atelier_id === atelier.id && w.actif).sort(parNomPrenom) : [];
  const nbLignes = atelier ? gens.length + 2 : q.lignes;

  const selAt = h('select', { id: 'qAtelier', class: 'in', style: 'max-width:320px', onChange: (e) => { q.atelier = e.target.value; vueMaquette(); } },
    h('option', { value: '' }, 'Atelier à écrire à la main'), q.ateliers.map((a) => h('option', { value: a.id }, a.nom)));
  selAt.value = q.atelier;
  const champMois = h('input', { id: 'qMois', class: 'in', type: 'month', value: q.mois, style: 'width:auto;min-width:190px', onChange: (e) => { q.mois = e.target.value; q.avecMois = !!e.target.value; vueMaquette(); } });
  const selLignes = h('select', { id: 'qLignes', class: 'in', style: 'width:auto', disabled: !!atelier, onChange: (e) => { q.lignes = +e.target.value; vueMaquette(); } },
    [10, 15, 20, 25, 30].map((n) => h('option', { value: String(n) }, n + ' lignes')));
  selLignes.value = String(q.lignes);

  const entetesJours = Array.from({ length: nbJ }, (_, i) => {
    const g = q.avecMois && aa ? new Date(aa, mm - 1, i + 1).getDay() : -1;
    return h('th', { class: 'jr' + (g === 0 || g === 6 ? ' we' : '') }, h('div', {}, g >= 0 ? JOURS_LETTRES[g] : ''), h('div', {}, String(i + 1)));
  });
  const lignes = Array.from({ length: nbLignes }, (_, i) => {
    const w = gens[i];
    return h('tr', {}, h('td', { class: 'nm' }, w ? w.nom : ''), h('td', { class: 'nm' }, w ? w.prenom : ''),
      Array.from({ length: nbJ }, (_, j) => {
        const g = q.avecMois && aa ? new Date(aa, mm - 1, j + 1).getDay() : -1;
        return h('td', { class: g === 0 || g === 6 ? 'we' : '' });
      }), h('td', { class: 'tt' }));
  });
  const baseStatuts = q.statuts.filter((s) => !s.esat_id || s.esat_id === S.profil.esat_id);

  render(pageAvec([
    h('div', { class: 'noprint stack' },
      h('div', { class: 'stack', style: 'gap:6px' }, h('p', { class: 'muted' }, marque.nom || ''), h('h1', {}, 'Maquette de ', h('em', {}, 'feuille de présence'))),
      h('div', { class: 'row', style: 'justify-content:flex-start;align-items:flex-end' },
        h('div', {}, h('label', { class: 'lbl', for: 'qAtelier' }, 'Atelier'), selAt),
        h('div', {}, h('label', { class: 'lbl', for: 'qMois' }, 'Mois (facultatif)'), champMois),
        h('div', {}, h('label', { class: 'lbl', for: 'qLignes' }, 'Lignes vides'), selLignes)),
      h('div', { class: 'row', style: 'justify-content:flex-start' },
        h('button', { type: 'button', class: 'primary', onClick: () => window.print() }, 'Imprimer ou enregistrer en PDF'),
        h('button', { type: 'button', class: 'secondary', onClick: () => chargerParametres() }, '‹ Retour aux paramètres')),
      !logoSur(marque.logo) ? h('p', { class: 'muted' }, 'Astuce : ajoutez le logo de l’ESAT dans les paramètres pour qu’il figure sur la maquette.') : null),
    h('div', { class: 'maquette', style: '--marque:' + couleur },
      h('div', { class: 'maq-tete' },
        logoSur(marque.logo) ? h('img', { src: logoSur(marque.logo), alt: '', class: 'maq-logo' }) : null,
        h('div', { class: 'stack', style: 'gap:2px' }, h('strong', { class: 'maq-nom' }, marque.nom || ''), h('span', { class: 'maq-titre' }, 'Feuille de présence mensuelle'))),
      h('div', { class: 'maq-ids' },
        h('p', {}, h('strong', {}, 'Atelier : '), atelier ? atelier.nom : '…………………………………'),
        h('p', {}, h('strong', {}, 'Mois : '), q.avecMois && aa ? libelleMois(aa, mm - 1) : '…………………………………'),
        h('p', {}, h('strong', {}, 'Moniteur : '), '…………………………………')),
      h('div', { class: 'maq-scroll' }, h('table', { class: 'maq-table' },
        h('thead', {}, h('tr', {}, h('th', { class: 'nm' }, 'Nom'), h('th', { class: 'nm' }, 'Prénom'), entetesJours, h('th', { class: 'tt' }, 'Total'))),
        h('tbody', {}, lignes))),
      h('p', { class: 'maq-leg' }, h('strong', {}, 'Codes : '), baseStatuts.map((s) => s.code + ' = ' + s.nom).join(' · ')),
      h('div', { class: 'sign' }, h('div', {}, 'Visa du moniteur'), h('div', {}, 'Visa de la direction')),
      h('p', { class: 'muted', style: 'font-size:12px' }, 'Maquette éditée avec Atelio le ' + new Date().toLocaleDateString('fr-FR') + '.'))
  ], true));
}

// ---------------------------------------------------------------------
// PLANNING : jours fériés / fermetures + absences prévues
// ---------------------------------------------------------------------
function paques(an) { // algorithme de Meeus/Jones/Butcher
  const a = an % 19; const b = Math.floor(an / 100); const c = an % 100; const d = Math.floor(b / 4); const e = b % 4;
  const f = Math.floor((b + 8) / 25); const g = Math.floor((b - f + 1) / 3); const hh = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4); const k = c % 4; const l = (32 + 2 * e + 2 * i - hh - k) % 7;
  const m = Math.floor((a + 11 * hh + 22 * l) / 451); const t = hh + l - 7 * m + 114;
  return new Date(an, Math.floor(t / 31) - 1, (t % 31) + 1);
}
function feriesFrance(an) {
  const p = paques(an);
  const plus = (n) => new Date(an, p.getMonth(), p.getDate() + n);
  return [[new Date(an, 0, 1), 'Jour de l’An'], [plus(1), 'Lundi de Pâques'], [new Date(an, 4, 1), 'Fête du Travail'], [new Date(an, 4, 8), 'Victoire 1945'],
    [plus(39), 'Ascension'], [plus(50), 'Lundi de Pentecôte'], [new Date(an, 6, 14), 'Fête nationale'], [new Date(an, 7, 15), 'Assomption'],
    [new Date(an, 10, 1), 'Toussaint'], [new Date(an, 10, 11), 'Armistice 1918'], [new Date(an, 11, 25), 'Noël']]
    .map(([dt, motif]) => ({ jour: isoDe(dt), motif, semaine: dt.getDay() >= 1 && dt.getDay() <= 5 }));
}
// Jours fermés = jours fériés français (automatiques, sauf si l'ESAT travaille ce jour-là) + fermetures ajoutées par l'ESAT.
// Une ligne dont le motif commence par « ! » signifie « l'ESAT travaille ce jour férié ».
const OUVERT = '!ouvert';
function mapFermes(lignes, annees) {
  const m = {};
  const ouverts = new Set((lignes || []).filter((x) => String(x.motif || '').startsWith('!')).map((x) => String(x.jour).slice(0, 10)));
  annees.forEach((an) => feriesFrance(an).forEach((f) => { if (!ouverts.has(f.jour)) m[f.jour] = f.motif; }));
  (lignes || []).forEach((x) => { if (!String(x.motif || '').startsWith('!')) m[String(x.jour).slice(0, 10)] = x.motif || 'Fermeture'; });
  return m;
}

function prochainOuvre(iso) {
  let d = dateDepuisISO(iso);
  do { d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6);
  return isoDe(d);
}
function grouperFermetures(liste) {
  const g = [];
  liste.forEach((x) => {
    const dern = g[g.length - 1];
    if (dern && dern.motif === x.motif && prochainOuvre(dern.fin) === x.jour) dern.fin = x.jour;
    else g.push({ debut: x.jour, fin: x.jour, motif: x.motif });
  });
  return g;
}
function periodeTexte(debut, fin) {
  const a = dateDepuisISO(debut); const b = dateDepuisISO(fin);
  if (debut === fin) return a.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  const sameAn = a.getFullYear() === b.getFullYear();
  return 'du ' + a.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: sameAn ? undefined : 'numeric' }) + ' au ' + b.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Messages du bloc « absences prévues » : conservés quand la page se recharge après une action
function ctxAbsences(base) {
  if (!S.abs) S.abs = { flash: '', erreur: '' };
  return { ...base, get flash() { return S.abs.flash; }, set flash(v) { S.abs.flash = v; }, get erreur() { return S.abs.erreur; }, set erreur(v) { S.abs.erreur = v; } };
}

async function chargerPlanning(garderMessages) {
  if (!garderMessages) S.abs = null;
  const p = S.profil;
  const ancien = garderMessages && S.pl ? S.pl : {};
  const auj = new Date();
  const debutFermes = isoJour(auj.getFullYear(), 0, 1);
  const [at, tr, st, ab, fe] = await Promise.all([
    sb.from('ateliers').select('id, nom').eq('esat_id', p.esat_id).order('nom'),
    sb.from('travailleurs').select('id, prenom, nom, atelier_id, actif').eq('esat_id', p.esat_id).order('nom'),
    sb.from('statuts').select('id, code, nom, couleur, ordre, esat_id').order('ordre').order('code'),
    sb.from('absences_prevues').select('id, travailleur_id, statut_id, debut, fin, note').gte('fin', aujourdhuiISO()).order('debut'),
    sb.from('jours_fermes').select('id, jour, motif').gte('jour', debutFermes).order('jour')
  ]);
  const ko = [at, tr, st].find((x) => x.error);
  if (ko) return vueMessage('Chargement impossible', ko.error.message);
  S.pl = {
    ateliers: at.data, travailleurs: tr.data, statuts: st.data,
    absences: ab.error ? [] : ab.data, fermes: fe.error ? [] : fe.data, indispo: !!(ab.error || fe.error),
    msg: ancien.msg || '', err: ancien.err || '', annee: ancien.annee || auj.getFullYear()
  };
  vuePlanning();
}

async function ajouterFermetures(lignes, texteOk) {
  const pl = S.pl;
  const rows = lignes.map((x) => ({ esat_id: S.profil.esat_id, jour: x.jour, motif: x.motif }));
  if (!rows.length) { pl.err = 'Aucun jour ouvré à ajouter.'; pl.msg = ''; return vuePlanning(); }
  S.abs = null;
  const { error } = await sb.from('jours_fermes').upsert(rows, { onConflict: 'esat_id,jour', ignoreDuplicates: true });
  if (error) { pl.err = 'Enregistrement impossible : ' + error.message; pl.msg = ''; return vuePlanning(); }
  pl.err = ''; pl.msg = texteOk;
  return chargerPlanning(true);
}

async function basculerFerie(f, travaille) {
  const pl = S.pl;
  S.abs = null;
  const requete = travaille
    ? sb.from('jours_fermes').upsert([{ esat_id: S.profil.esat_id, jour: f.jour, motif: OUVERT }], { onConflict: 'esat_id,jour' })
    : sb.from('jours_fermes').delete().eq('esat_id', S.profil.esat_id).eq('jour', f.jour);
  const { error } = await requete;
  if (error) { pl.err = 'Enregistrement impossible : ' + error.message; pl.msg = ''; return vuePlanning(); }
  pl.err = ''; pl.msg = travaille ? f.motif + ' : l’ESAT travaille ce jour-là, il n’est plus compté comme fermé.' : f.motif + ' : jour férié rétabli.';
  return chargerPlanning(true);
}

async function retirerFermeture(g) {
  const pl = S.pl;
  S.abs = null;
  const { error } = await sb.from('jours_fermes').delete().eq('esat_id', S.profil.esat_id).gte('jour', g.debut).lte('jour', g.fin);
  if (error) { pl.err = 'Suppression impossible : ' + error.message; pl.msg = ''; return vuePlanning(); }
  pl.err = ''; pl.msg = 'Fermeture retirée.';
  return chargerPlanning(true);
}

// Bloc réutilisable : prévoir des absences à l'avance (administrateur : tout l'ESAT ; moniteur : son atelier)
function blocAbsencesPrevues(c) {
  const parId = Object.fromEntries(c.statuts.map((s) => [s.id, s]));
  const parTrav = Object.fromEntries(c.workers.map((w) => [w.id, w]));
  const nomAtelier = (id) => (c.ateliers.find((a) => a.id === id) || {}).nom || '';
  const motifs = c.statuts.filter((s) => !(s.code === 'P' && !s.esat_id));
  const sansP = (s) => (s.code === 'A' && !s.esat_id ? 'Absent (non précisé)' : s.nom);
  const actifs = c.workers.filter((w) => w.actif).sort(parNomPrenom);
  const auj = aujourdhuiISO();

  const selTrav = h('select', { id: 'apTrav', class: 'in' }, h('option', { value: '' }, 'Choisir…'),
    c.ateliers.length > 1 && c.parAtelier
      ? c.ateliers.map((a) => h('optgroup', { label: a.nom }, actifs.filter((w) => w.atelier_id === a.id).map((w) => h('option', { value: w.id }, w.nom + ' ' + w.prenom))))
      : actifs.map((w) => h('option', { value: w.id }, w.nom + ' ' + w.prenom)));
  const selMotif = h('select', { id: 'apStatut', class: 'in' }, motifs.map((s) => h('option', { value: s.id }, sansP(s))));
  const champDebut = h('input', { id: 'apDebut', class: 'in', type: 'date', min: isoDe(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)) });
  const champFin = h('input', { id: 'apFin', class: 'in', type: 'date' });
  const champNote = h('input', { id: 'apNote', class: 'in', type: 'text', maxlength: '80', placeholder: 'Ex. rendez-vous médical (facultatif)' });

  const ajouter = async () => {
    const trav = selTrav.value; const st = selMotif.value; const debut = champDebut.value; const fin = champFin.value || debut;
    const refus = (t) => { c.flash = ''; c.erreur = t; c.redessiner(); };
    if (!trav) return refus('Choisissez la personne concernée.');
    if (!st) return refus('Choisissez le motif.');
    if (!debut) return refus('Indiquez le premier jour de l’absence.');
    if (fin < debut) return refus('La date de fin ne peut pas être avant la date de début.');
    const { error } = await sb.from('absences_prevues').insert({
      esat_id: S.profil.esat_id, travailleur_id: trav, statut_id: st, debut, fin, note: champNote.value.trim() || null, cree_par: S.user.id
    });
    if (error) return refus(/absences_prevues|does not exist|schema cache/i.test(error.message) ? 'Cette option n’est pas encore activée : l’éditeur doit exécuter atelio-v21.sql.' : 'Enregistrement impossible : ' + error.message);
    c.erreur = ''; c.flash = 'Absence prévue enregistrée.';
    await c.recharger();
  };
  const retirer = async (it) => {
    const { error } = await sb.from('absences_prevues').delete().eq('id', it.id);
    if (error) { c.flash = ''; c.erreur = 'Suppression impossible : ' + error.message; return c.redessiner(); }
    c.erreur = ''; c.flash = 'Absence prévue retirée.';
    await c.recharger();
  };

  const items = c.items.filter((it) => it.fin >= auj && parTrav[it.travailleur_id]);
  const liste = items.length === 0
    ? h('p', { class: 'muted' }, 'Aucune absence prévue pour le moment.')
    : h('ul', { class: 'list', style: 'gap:8px' }, items.map((it) => {
        const w = parTrav[it.travailleur_id]; const s = parId[it.statut_id];
        const enCours = it.debut <= auj && auj <= it.fin;
        return h('li', { class: 'prevue' },
          h('div', { class: 'stack', style: 'gap:2px;min-width:0' },
            h('strong', {}, w.prenom + ' ' + w.nom, c.parAtelier ? h('span', { class: 'muted', style: 'font-weight:430' }, ' · ' + nomAtelier(w.atelier_id)) : null),
            h('span', { class: 'muted' }, periodeTexte(it.debut, it.fin), it.note ? ' · ' + it.note : '')),
          h('div', { class: 'row', style: 'justify-content:flex-end;gap:10px;flex-wrap:nowrap' },
            enCours ? h('span', { class: 'tag' }, 'En cours') : null,
            s ? h('span', { class: 'pill', style: '--c:' + couleurSure(s.couleur) }, s.nom) : null,
            h('button', { type: 'button', class: 'rm', 'aria-label': 'Retirer l’absence prévue de ' + w.prenom + ' ' + w.nom, onClick: () => retirer(it) }, 'Retirer')));
      }));

  return h('section', { class: 'card stack', 'aria-labelledby': 't-prevues' },
    h('h2', { id: 't-prevues' }, 'Absences prévues'),
    h('p', { class: 'muted' }, 'Congés, rendez-vous, formations… Prévenez Atelio à l’avance : le jour venu, l’absence apparaît déjà dans la saisie du moniteur, qui n’a plus qu’à la confirmer.'),
    c.erreur ? h('p', { class: 'err', role: 'alert' }, c.erreur) : null,
    c.flash ? h('p', { class: 'ok', role: 'status' }, c.flash) : null,
    h('div', { class: 'fields' },
      h('div', { style: 'flex:2 1 220px' }, h('label', { class: 'lbl', for: 'apTrav' }, 'Personne'), selTrav),
      h('div', { style: 'flex:1 1 180px' }, h('label', { class: 'lbl', for: 'apStatut' }, 'Motif'), selMotif),
      h('div', { style: 'flex:1 1 160px' }, h('label', { class: 'lbl', for: 'apDebut' }, 'Du'), champDebut),
      h('div', { style: 'flex:1 1 160px' }, h('label', { class: 'lbl', for: 'apFin' }, 'Au (inclus)'), champFin),
      h('div', { style: 'flex:2 1 240px' }, h('label', { class: 'lbl', for: 'apNote' }, 'Précision'), champNote)),
    h('div', {}, h('button', { type: 'button', class: 'primary', onClick: ajouter }, 'Prévoir cette absence')),
    liste);
}

function vuePlanning() {
  const pl = S.pl;
  const annee = new Date().getFullYear();
  const choixAnnee = h('select', { id: 'anneeFeries', class: 'in', style: 'width:auto', onChange: (e) => { pl.annee = +e.target.value; vuePlanning(); } },
    [annee, annee + 1].map((a) => h('option', { value: String(a) }, String(a))));
  choixAnnee.value = String(pl.annee || annee);
  const ouverts = new Set(pl.fermes.filter((x) => String(x.motif || '').startsWith('!')).map((x) => String(x.jour).slice(0, 10)));
  const feries = feriesFrance(pl.annee || annee);
  const nomsFeries = new Set(feries.map((f) => f.jour + '|' + f.motif));
  const champDu = h('input', { id: 'fermeDu', class: 'in', type: 'date' });
  const champAu = h('input', { id: 'fermeAu', class: 'in', type: 'date' });
  const champMotif = h('input', { id: 'fermeMotif', class: 'in', type: 'text', maxlength: '60', placeholder: 'Ex. Journée pédagogique, pont, fermeture de fin d’année' });
  const groupes = grouperFermetures(pl.fermes
    .filter((x) => !String(x.motif || '').startsWith('!') && !nomsFeries.has(String(x.jour).slice(0, 10) + '|' + x.motif))
    .map((x) => ({ ...x, jour: String(x.jour).slice(0, 10) }))
    .sort((a, b) => a.jour.localeCompare(b.jour)));

  const ajouterPlage = () => {
    const du = champDu.value; const au = champAu.value || du; const motif = champMotif.value.trim() || 'Fermeture';
    if (!du) { pl.err = 'Indiquez le premier jour de fermeture.'; pl.msg = ''; return vuePlanning(); }
    if (au < du) { pl.err = 'La date de fin ne peut pas être avant la date de début.'; pl.msg = ''; return vuePlanning(); }
    const jours = [];
    for (let d = dateDepuisISO(du), n = 0; isoDe(d) <= au && n < 400; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1), n++) {
      if (d.getDay() >= 1 && d.getDay() <= 5) jours.push({ jour: isoDe(d), motif });
    }
    if (jours.length > 120) { pl.err = 'Période trop longue (120 jours ouvrés au maximum à la fois).'; pl.msg = ''; return vuePlanning(); }
    return ajouterFermetures(jours, 'Ajouté (' + jours.length + ' jour' + (jours.length > 1 ? 's' : '') + ' ouvré' + (jours.length > 1 ? 's' : '') + ').');
  };

  render(pageAvec([
    h('div', { class: 'noprint' }, navPrincipale('planning')),
    h('div', { class: 'stack', style: 'gap:6px' }, h('p', { class: 'muted' }, (S.marque && S.marque.nom) || ''), h('h1', {}, 'Planning')),
    pl.indispo ? h('p', { class: 'err', role: 'alert' }, 'Le planning n’est pas encore activé sur votre base de données : l’éditeur doit exécuter le fichier atelio-v21.sql dans Supabase.') : null,
    pl.err ? h('p', { class: 'err', role: 'alert' }, pl.err) : null,
    pl.msg ? h('p', { class: 'ok', role: 'status' }, pl.msg) : null,
    h('section', { class: 'card stack', 'aria-labelledby': 't-fermes' },
      h('h2', { id: 't-fermes' }, 'Jours fériés et journées banalisées'),
      h('p', { class: 'muted' }, 'Les jours fermés sont grisés comme les week-ends dans le tableau de bord, les fiches et les exports, et ne comptent pas dans « Non saisi ».'),
      h('div', { class: 'row', style: 'justify-content:flex-start;align-items:flex-end' },
        h('div', {}, h('label', { class: 'lbl', for: 'anneeFeries' }, 'Jours fériés français (déjà pris en compte)'), choixAnnee)),
      h('ul', { class: 'list', style: 'gap:6px' }, feries.map((f) => {
        const travaille = ouverts.has(f.jour);
        return h('li', { class: 'prevue' + (f.semaine ? '' : ' discret') },
          h('div', { class: 'stack', style: 'gap:2px;min-width:0' }, h('strong', {}, f.motif),
            h('span', { class: 'muted' }, periodeTexte(f.jour, f.jour) + (f.semaine ? '' : ' · tombe un week-end'))),
          f.semaine
            ? (travaille
                ? h('div', { class: 'row', style: 'justify-content:flex-end;gap:10px;flex-wrap:nowrap' }, h('span', { class: 'tag' }, 'L’ESAT travaille'),
                    h('button', { type: 'button', class: 'linkbtn', onClick: () => basculerFerie(f, false) }, 'Rétablir le férié'))
                : h('button', { type: 'button', class: 'linkbtn', 'aria-label': 'L’ESAT travaille le ' + f.motif, onClick: () => basculerFerie(f, true) }, 'L’ESAT travaille ce jour-là'))
            : null);
      })),
      h('h3', { style: 'margin-top:8px' }, 'Journées banalisées et fermetures de votre ESAT'),
      h('p', { class: 'muted' }, 'Journée pédagogique, pont, fermeture de fin d’année… ajoutez ici les jours où votre ESAT est fermé en plus des jours fériés.'),
      h('div', { class: 'fields' },
        h('div', { style: 'flex:1 1 160px' }, h('label', { class: 'lbl', for: 'fermeDu' }, 'Du'), champDu),
        h('div', { style: 'flex:1 1 160px' }, h('label', { class: 'lbl', for: 'fermeAu' }, 'Au (inclus, facultatif)'), champAu),
        h('div', { style: 'flex:2 1 260px' }, h('label', { class: 'lbl', for: 'fermeMotif' }, 'Motif'), champMotif)),
      h('div', {}, h('button', { type: 'button', class: 'primary', onClick: ajouterPlage }, 'Ajouter')),
      groupes.length === 0
        ? h('p', { class: 'muted' }, 'Aucune journée banalisée ni fermeture ajoutée.')
        : h('ul', { class: 'list', style: 'gap:8px' }, groupes.map((g) => h('li', { class: 'prevue' },
            h('div', { class: 'stack', style: 'gap:2px;min-width:0' }, h('strong', {}, g.motif || 'Fermeture'), h('span', { class: 'muted' }, periodeTexte(g.debut, g.fin))),
            h('button', { type: 'button', class: 'rm', 'aria-label': 'Retirer : ' + (g.motif || 'fermeture') + ', ' + periodeTexte(g.debut, g.fin), onClick: () => retirerFermeture(g) }, 'Retirer'))))),
    blocAbsencesPrevues(ctxAbsences({
      workers: pl.travailleurs, ateliers: pl.ateliers, statuts: pl.statuts, items: pl.absences, parAtelier: true,
      redessiner: () => vuePlanning(), recharger: () => { S.pl.msg = ''; S.pl.err = ''; return chargerPlanning(true); }
    }))
  ], true));
}

// ---------------------------------------------------------------------
// JOURNAL DES MODIFICATIONS (administrateur d'ESAT)
// ---------------------------------------------------------------------
const TYPES_JOURNAL = { tous: 'Tout', presence: 'Présences', validation: 'Validations de journée', cloture: 'Clôtures de mois' };
const GROUPE_TYPE = { presence: 'presence', validation: 'validation', reouverture: 'validation', cloture: 'cloture', reouverture_mois: 'cloture' };

async function chargerJournal(options) {
  const ancien = S.j || {};
  const o = { periode: 30, type: 'tous', atelier: 'tous', texte: '', limite: 500, ...ancien, ...(options || {}) };
  render(pageAvec([h('div', { class: 'noprint' }, navPrincipale('journal')), h('p', { class: 'muted' }, 'Chargement…')], true));
  const depuis = new Date(Date.now() - o.periode * 86400000).toISOString();
  const [jr, at] = await Promise.all([
    sb.from('journal').select('id, quand, user_id, user_email, user_role, type, jour, atelier_id, cible, avant, apres').gte('quand', depuis).order('quand', { ascending: false }).limit(o.limite),
    sb.from('ateliers').select('id, nom').eq('esat_id', S.profil.esat_id).order('nom')
  ]);
  S.j = { ...o, ateliers: at.error ? [] : at.data, lignes: jr.error ? [] : jr.data, indispo: !!jr.error, erreur: jr.error ? jr.error.message : '' };
  vueJournal();
}

function regrouperJournal(lignes) {
  const sortie = [];
  lignes.forEach((e) => {
    const g = sortie[sortie.length - 1];
    if (e.type === 'presence' && g && g.type === 'presence' && g.user_id === e.user_id && g.jour === e.jour
      && (g.apres || '') === (e.apres || '') && (g.avant || '') === (e.avant || '') && String(g.quand).slice(0, 16) === String(e.quand).slice(0, 16)) g.membres.push(e);
    else sortie.push({ ...e, membres: [e] });
  });
  return sortie.flatMap((g) => (g.type === 'presence' && g.membres.length >= 4 ? [g] : g.membres.map((m) => ({ ...m, membres: [m] }))));
}

function decrireJournal(e) {
  const mois = (c) => (/^\d{4}-\d{2}$/.test(c || '') ? libelleMois(+c.slice(0, 4), +c.slice(5, 7) - 1) : c);
  if (e.type === 'presence') {
    if (e.membres && e.membres.length >= 4) return [h('strong', {}, nf(e.membres.length) + ' présences enregistrées d’un coup : '), (e.apres || 'supprimées'),
      h('details', { class: 'donnees' }, h('summary', {}, 'Voir les noms'), h('p', { class: 'muted' }, e.membres.map((m) => m.cible).join(', ')))];
    if (e.avant == null) return [h('strong', {}, e.cible), ' : saisie « ' + e.apres + ' »'];
    if (e.apres == null) return [h('strong', {}, e.cible), ' : saisie supprimée (c’était « ' + e.avant + ' »)'];
    return [h('strong', {}, e.cible), ' : ' + e.avant + ' → ', h('strong', {}, e.apres)];
  }
  if (e.type === 'validation') return ['Journée validée · atelier ', h('strong', {}, e.cible || '')];
  if (e.type === 'reouverture') return ['Journée rouverte pour correction · atelier ', h('strong', {}, e.cible || '')];
  if (e.type === 'cloture') return [h('strong', {}, 'Mois clôturé'), ' : ' + mois(e.cible)];
  if (e.type === 'reouverture_mois') return [h('strong', {}, 'Mois rouvert'), ' : ' + mois(e.cible)];
  return e.type;
}

function vueJournal() {
  const j = S.j;
  const q = norm(j.texte);
  const filtres = j.lignes.filter((e) => (j.type === 'tous' || GROUPE_TYPE[e.type] === j.type)
    && (j.atelier === 'tous' || e.atelier_id === j.atelier)
    && (!q || norm((e.cible || '') + ' ' + (e.user_email || '')).includes(q)));
  const lignes = regrouperJournal(filtres);
  const selP = h('select', { id: 'jPeriode', class: 'in', style: 'width:auto', onChange: (e) => chargerJournal({ periode: +e.target.value }) },
    [[7, '7 derniers jours'], [30, '30 derniers jours'], [90, '90 derniers jours'], [365, '12 derniers mois']].map(([v, t]) => h('option', { value: String(v) }, t)));
  selP.value = String(j.periode);
  const selT = h('select', { id: 'jType', class: 'in', style: 'width:auto', onChange: (e) => { j.type = e.target.value; vueJournal(); } },
    Object.entries(TYPES_JOURNAL).map(([v, t]) => h('option', { value: v }, t)));
  selT.value = j.type;
  const selA = h('select', { id: 'jAtelier', class: 'in', style: 'width:auto;max-width:260px', onChange: (e) => { j.atelier = e.target.value; vueJournal(); } },
    h('option', { value: 'tous' }, 'Tous les ateliers'), j.ateliers.map((a) => h('option', { value: a.id }, a.nom)));
  selA.value = j.atelier;
  const champ = h('input', { id: 'jTexte', class: 'in', type: 'search', value: j.texte, placeholder: 'Nom ou e-mail', style: 'min-width:200px',
    onInput: (e) => { j.texte = e.target.value; clearTimeout(j.t); j.t = setTimeout(() => { vueJournal(); const c2 = document.getElementById('jTexte'); if (c2) { c2.focus(); c2.setSelectionRange(c2.value.length, c2.value.length); } }, 250); } });

  const quand = (iso) => new Date(iso).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const table = h('div', { class: 'scroll' }, h('table', { class: 'tbl' },
    h('caption', { class: 'sr' }, 'Journal des modifications'),
    h('thead', {}, h('tr', {}, h('th', {}, 'Quand'), h('th', {}, 'Qui'), h('th', {}, 'Jour concerné'), h('th', {}, 'Modification'))),
    h('tbody', {}, lignes.map((e) => h('tr', {},
      h('td', { style: 'white-space:nowrap' }, quand(e.quand)),
      h('td', {}, e.user_email || 'Système', e.user_role && ROLES[e.user_role] ? h('div', { class: 'muted', style: 'font-size:13px' }, ROLES[e.user_role]) : null),
      h('td', { style: 'white-space:nowrap' }, e.jour ? (e.type === 'cloture' || e.type === 'reouverture_mois' ? '—' : jourCourt(e.jour)) : '—'),
      h('td', {}, decrireJournal(e)))))));

  render(pageAvec([
    h('div', { class: 'noprint' }, navPrincipale('journal')),
    h('div', { class: 'stack', style: 'gap:6px' }, h('p', { class: 'muted' }, (S.marque && S.marque.nom) || ''), h('h1', {}, 'Journal des ', h('em', {}, 'modifications'))),
    h('p', { class: 'muted' }, 'Qui a saisi, modifié ou validé quoi, et quand. Ce journal s’écrit tout seul : personne ne peut le modifier ni l’effacer, pas même un administrateur.'),
    j.indispo
      ? h('p', { class: 'err', role: 'alert' }, 'Le journal n’est pas encore activé sur votre base de données : l’éditeur doit exécuter le fichier atelio-v21.sql dans Supabase.')
      : [h('div', { class: 'row', style: 'justify-content:flex-start;align-items:flex-end' },
          h('div', {}, h('label', { class: 'lbl', for: 'jPeriode' }, 'Période'), selP),
          h('div', {}, h('label', { class: 'lbl', for: 'jType' }, 'Type'), selT),
          h('div', {}, h('label', { class: 'lbl', for: 'jAtelier' }, 'Atelier'), selA),
          h('div', {}, h('label', { class: 'lbl', for: 'jTexte' }, 'Rechercher'), champ)),
        lignes.length === 0 ? h('p', { class: 'card' }, 'Aucune modification sur cette période avec ces filtres.') : table,
        j.lignes.length >= j.limite ? h('div', {}, h('button', { type: 'button', class: 'secondary', onClick: () => chargerJournal({ limite: j.limite + 500 }) }, 'Afficher plus (anciennes modifications)')) : null]
  ], true));
}

// ---------------------------------------------------------------------
// AIDE ET SUPPORT
// ---------------------------------------------------------------------
async function vueAide() {
  const SUPPORT_EMAIL = await lireSupport();
  const role = S.profil ? S.profil.role : '';
  const q = (titre, ...contenu) => h('details', { class: 'faq' }, h('summary', {}, titre), h('div', { class: 'stack', style: 'gap:8px;padding:4px 0 12px' }, contenu.map((c) => (typeof c === 'string' ? h('p', {}, c) : c))));
  const etapes = (liste) => h('ol', { class: 'etapes' }, liste.map((t) => h('li', {}, t)));

  const moniteur = [
    q('Comment saisir la présence du jour ?', etapes(['Ouvrez « Saisie du jour ».', 'Pour chaque personne, cliquez sur « Présent » ou « Absent ». Si elle est absente, choisissez le motif dans la liste (congés payés, maladie…).', 'Quand tout le monde est renseigné, cliquez sur « Valider la journée ».']),
      'Astuce : « Tout le monde est présent » remplit toute la liste d’un coup, puis vous corrigez les absents.'),
    q('Je me suis trompé, comment corriger ?', 'Si la journée n’est pas encore validée, cliquez simplement sur le bon statut. Si elle est validée, cliquez sur « Modifier la saisie », corrigez, puis validez à nouveau.',
      'Pour un jour passé, utilisez « Jour précédent » ou le calendrier (jusqu’à 3 mois en arrière).'),
    q('Que veut dire « Prévu : Congés payés » sur une ligne ?', 'La direction (ou vous) avez prévu cette absence à l’avance. Cliquez sur « Confirmer » pour l’enregistrer, ou sur « Présent » si la personne est finalement là. Le bouton « Appliquer les absences prévues » les confirme toutes d’un coup.'),
    q('Comment prévoir une absence à l’avance ?', 'En bas de la page « Saisie du jour », remplissez « Absences prévues » : la personne, le motif et les dates. Le jour venu, l’absence est déjà proposée.'),
    q('Que veut dire « Ne travaille pas ce jour » ou « Matin » / « Après-midi » ?', 'Chaque travailleur a des horaires réglés par la direction (jours travaillés, matin ou après-midi). Les personnes qui ne travaillent pas ce jour-là sont grisées et ne comptent pas dans les personnes à renseigner. Si elles sont venues exceptionnellement, la direction peut modifier leurs horaires.'),
    q('Pourquoi tout est grisé avec un cadenas 🔒 ?', 'Le mois a été clôturé par la direction : les présences de ce mois ne peuvent plus être modifiées. Si une correction est nécessaire, demandez à la direction de rouvrir le mois.'),
    q('J’ai oublié mon mot de passe', 'Demandez un nouveau mot de passe à la direction de votre ESAT : elle peut le réinitialiser dans « Gérer l’ESAT ».')
  ];
  const admin = [
    q('Comment lire le tableau de bord ?', 'Chaque ligne grisée résume un atelier (présents sur effectif). Une bordure verte signifie que le moniteur a validé la journée. Cliquez sur le nom d’un atelier pour voir le détail de chaque travailleur.',
      'Les week-ends et les jours fermés sont grisés. « Non saisi » compte les jours ouvrés sans statut.'),
    q('Comment exporter pour la paie ?', 'Dans le tableau de bord, choisissez le mois et l’atelier (ou tous), puis « Exporter (Excel) ». Le fichier contient les totaux par statut. « Fiches mensuelles (PDF) » donne une page par travailleur à signer.'),
    q('À quoi sert le Reporting ?', 'Il résume le mois en chiffres et en graphiques : taux de présence, absences par motif, comparaison des ateliers, jours de la semaine les plus touchés, personnes à accompagner. Le bouton « Imprimer / PDF » en sort une page propre.'),
    q('Comment clôturer un mois ?', etapes(['Ouvrez « Reporting » et choisissez le mois terminé.', 'Vérifiez les points d’attention (journées non validées…).', 'Cliquez sur « Clôturer », puis confirmez.']),
      'Plus personne ne peut alors modifier les présences de ce mois. Vous pouvez le rouvrir au même endroit si besoin.'),
    q('Jours fériés, journées banalisées, absences prévues', 'Les jours fériés français sont déjà pris en compte automatiquement. Dans « Planning », ajoutez les journées banalisées ou fermetures propres à votre ESAT (pont, journée pédagogique, fin d’année) : ces jours sont grisés et ne comptent plus dans « Non saisi ». Si votre ESAT travaille un jour férié, indiquez-le au même endroit. Vous pouvez aussi prévoir les congés ou rendez-vous à l’avance : le moniteur n’a plus qu’à les confirmer.'),
    q('À quoi sert le Journal ?', 'Il garde la trace de chaque saisie, modification, validation et clôture : qui, quand, avant/après. Il s’écrit automatiquement et personne ne peut l’effacer : utile en cas de question ou de contrôle.'),
    q('Créer un compte moniteur ou réinitialiser un mot de passe', etapes(['Ouvrez « Gérer l’ESAT », section « Comptes ».', 'Saisissez l’e-mail, choisissez le rôle (et l’atelier pour un moniteur).', 'Notez le mot de passe affiché et transmettez-le à la personne.']),
      'Un moniteur ne peut pas changer son mot de passe lui-même : c’est vous qui le gérez.'),
    q('Statuts et motifs d’absence', 'Dans « Statuts et motifs », ajoutez les statuts propres à votre ESAT (ex. Formation, Rendez-vous médical) avec une couleur et un code court.'),
    q('Horaires des travailleurs (demi-journées, jours non travaillés)', 'Dans « Gérer l’ESAT », à l’ajout d’un travailleur ou avec « Modifier les horaires », choisissez pour chaque jour du lundi au vendredi : journée, matin, après-midi ou « Ne travaille pas ». Les jours non travaillés sont grisés dans le tableau de bord, les fiches et les exports, et ne comptent pas dans « Non saisi ». Les matins et après-midis sont repérés par M et A (ou « matin » / « après-midi »).'),
    q('Logo, couleur et maquette de l’ESAT', 'Dans « Paramètres », ajoutez le logo et choisissez une couleur : ils apparaissent dans l’en-tête, les fiches, les exports Excel et la maquette de feuille de présence vierge.')
  ];
  const editeur = [
    q('Créer un ESAT client', etapes(['Dans « Espace éditeur », saisissez le nom de l’ESAT et ajoutez-le.', 'Ouvrez-le avec « Gérer cet ESAT » pour créer ses ateliers et importer ses travailleurs.', 'Créez ensuite le compte de son administrateur.'])),
    q('Ce que vous voyez (et ne voyez pas)', 'En tant qu’éditeur, vous gérez les ESAT, les comptes et les statuts, mais vous ne voyez jamais les présences ni les motifs d’absence des travailleurs : ce sont des données sensibles qui restent entre l’ESAT et ses moniteurs.'),
    q('Mettre à jour Atelio', 'Les nouveautés arrivent en deux temps : d’abord le script SQL (Supabase > SQL Editor), puis le dépôt du nouveau site (Netlify > Deploys), suivi d’un rechargement forcé (Ctrl + F5).')
  ];
  const sujets = role === 'moniteur' ? moniteur : (role === 'super_admin' ? editeur : admin);
  const mail = SUPPORT_EMAIL
    ? 'mailto:' + SUPPORT_EMAIL + '?subject=' + encodeURIComponent('Atelio ' + APP_VERSION + ' — besoin d’aide') + '&body=' + encodeURIComponent('Bonjour,\n\nMon problème :\n\n\n---\nVersion : ' + APP_VERSION + '\nRôle : ' + (ROLES[role] || '') + '\n')
    : '';

  render(pageAvec([
    S.profil ? h('div', { class: 'noprint' }, navPrincipale('')) : null,
    h('div', { class: 'stack', style: 'gap:6px' }, h('p', { class: 'muted' }, 'Atelio ' + APP_VERSION), h('h1', {}, 'Aide et ', h('em', {}, 'support'))),
    h('section', { class: 'card stack', 'aria-labelledby': 't-faq' },
      h('h2', { id: 't-faq' }, 'Questions fréquentes'),
      h('div', { class: 'faqs' }, sujets)),
    h('section', { class: 'card stack', 'aria-labelledby': 't-supp' },
      h('h2', { id: 't-supp' }, 'Une question, un souci ?'),
      mail
        ? h('div', { class: 'stack' },
            h('p', {}, 'Écrivez-nous : nous vous répondons dès que possible. Indiquez ce que vous faisiez et ce que vous voyez à l’écran.'),
            h('div', {}, h('a', { class: 'primary btnlink', href: mail }, 'Écrire au support')))
        : h('p', {}, role === 'moniteur'
            ? 'Parlez-en à la direction de votre ESAT : elle pourra vous aider ou contacter l’éditeur d’Atelio.'
            : 'Contactez l’éditeur d’Atelio en précisant ce que vous faisiez et ce que vous voyez à l’écran (une capture d’écran aide beaucoup).')),
    h('div', {}, h('button', { type: 'button', class: 'secondary', onClick: () => chargerAccueil() }, '‹ Retour à l’accueil'))
  ], false));
}

// ---------------------------------------------------------------------
// C'est parti
// ---------------------------------------------------------------------
demarrer();

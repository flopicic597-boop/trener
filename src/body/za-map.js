// Повезивање дијелова Z-Anatomy модела (енглески анатомски називи) са описима мишића
// (src/data/muscles*.js) и зонама атласа (src/data/body-zones.js).

/** „Long head of biceps brachii.l.001“ → { base: 'Long head of biceps brachii', side: 'L' } */
export function parseName(name) {
  let base = String(name).replace(/\.\d{3}$/, '');
  let side = 'C';
  const m = base.match(/\.(l|r)$/);
  if (m) { side = m[1] === 'l' ? 'L' : 'R'; base = base.slice(0, -2); }
  return { base: base.replace(/^\(|\)$/g, '').trim(), side };
}

// [правило, id мишића из описа (или null), зона]; први погодак важи
const MUSCLE_RULES = [
  [/sternocleidomastoid/i, 'scm', 'neck'], [/scalenus/i, 'scalenes', 'neck'], [/longus (colli|capitis)/i, 'dnf', 'neck'],
  [/rectus (anterior|lateralis) capitis/i, 'dnf', 'neck'], [/(rectus posterior|obliquus).*capitis/i, 'suboccipital', 'neck'],
  [/splenius/i, 'splenius', 'neck'], [/levator scapulae/i, 'levscap', 'neck'], [/masseter/i, 'masseter', 'neck'], [/temporalis muscle/i, 'temporalis', 'neck'],
  [/platysma|omohyoid|sternohyoid|frontalis|occipitalis|temporoparietalis|bucinator|corrugator|levator nasolabialis/i, null, 'neck'],
  [/descending part of trapezius/i, 'trapupper', 'traps'], [/transverse part of trapezius/i, 'trapmid', 'traps'], [/ascending part of trapezius/i, 'traplower', 'traps'],
  [/rhomboid/i, 'rhomboids', 'upperback'], [/serratus anterior/i, 'serratus', 'upperback'], [/serratus posterior/i, null, 'upperback'],
  [/pectoralis minor/i, 'pecminor', 'pecs'], [/pectoralis major/i, 'pecmajor', 'pecs'], [/subclavius/i, null, 'pecs'],
  [/clavicular part of deltoid/i, 'deltant', 'delts'], [/acromial part of deltoid/i, 'deltmid', 'delts'], [/spinal part of deltoid/i, 'deltpost', 'delts'],
  [/supraspinatus/i, 'supraspinatus', 'rotator'], [/infraspinatus/i, 'infraspinatus', 'rotator'], [/teres minor/i, 'teresminor', 'rotator'],
  [/subscapularis/i, 'subscapularis', 'rotator'], [/teres major/i, 'teresmajor', 'lats'], [/latissimus/i, 'latissimus', 'lats'],
  [/coracobrachialis/i, 'coracobrachialis', 'biceps'], [/biceps brachii/i, 'biceps', 'biceps'], [/brachioradialis/i, 'brachioradialis', 'forearm'],
  [/\bbrachialis/i, 'brachialis', 'biceps'], [/triceps/i, 'triceps', 'triceps'], [/anconeus/i, 'anconeus', 'triceps'],
  [/pronator teres/i, 'pronteres', 'forearm'], [/pronator quadratus/i, 'pronquad', 'forearm'], [/^supinator/i, 'supinator', 'forearm'],
  [/flexor carpi radialis/i, 'fcr', 'forearm'], [/flexor carpi ulnaris/i, 'fcu', 'forearm'], [/palmaris longus/i, 'palmaris', 'forearm'],
  [/flexor digitorum superficialis/i, 'fds', 'forearm'], [/flexor digitorum profundus/i, 'fdp', 'forearm'], [/extensor carpi radialis/i, 'ecrl', 'forearm'],
  [/extensor carpi ulnaris/i, 'ecu', 'forearm'], [/^extensor digitorum$/i, 'extdig', 'forearm'], [/abductor pollicis longus|extensor pollicis brevis/i, 'aplepb', 'forearm'],
  [/extensor pollicis longus/i, 'epl', 'forearm'], [/extensor indicis|extensor digiti minimi|flexor pollicis longus/i, null, 'forearm'],
  [/abductor pollicis brevis|flexor pollicis brevis|opponens pollicis|adductor pollicis/i, 'thenar', 'wrist'],
  [/digiti minimi(?: muscle)? of hand/i, 'hypothenar', 'wrist'], [/(interossei|lumbrical).*hand|palmar interossei/i, 'handint', 'wrist'],
  [/rectus abdominis/i, 'rectusabd', 'abs'], [/pyramidalis/i, null, 'abs'], [/external abdominal oblique/i, 'extoblique', 'obliques'],
  [/internal abdominal oblique/i, 'intoblique', 'obliques'], [/transversus abdominis/i, 'transversus', 'abs'], [/quadratus lumborum/i, 'ql', 'erectors'],
  [/iliocostalis|longissimus|spinalis/i, 'erector', 'erectors'], [/multifidus|semispinalis|rotatores|interspinales|intertransversarii/i, 'multifidus', 'erectors'],
  [/diaphragm/i, 'diaphragm', 'ribs'], [/external intercostal/i, 'extintercostals', 'ribs'], [/internal intercostal|innermost intercostal/i, 'intintercostals', 'ribs'],
  [/levatores .*costarum|transversus thoracis/i, null, 'ribs'],
  [/coccygeus|iliococcygeus|pubococcygeus|levator ani/i, 'pelvicfloor', 'si'],
  [/psoas/i, 'psoas', 'hipflex'], [/iliacus/i, 'iliacus', 'hipflex'], [/iliopectineal/i, null, 'hipflex'],
  [/gluteus maximus/i, 'gmax', 'glutemax'], [/gluteus medius/i, 'gmed', 'glutemed'], [/gluteus minimus/i, 'gmin', 'glutemed'], [/tensor fasciae latae/i, 'tfl', 'glutemed'],
  [/piriformis/i, 'piriformis', 'glutemax'], [/gemellus|obturator|quadratus femoris/i, 'deeprot', 'glutemax'], [/sartorius/i, 'sartorius', 'quads'],
  [/adductor (magnus|minimus)/i, 'addmagnus', 'adductors'], [/adductor longus/i, 'addlongus', 'adductors'], [/adductor brevis/i, 'addbrevis', 'adductors'],
  [/pectineus/i, 'pectineus', 'adductors'], [/gracilis/i, 'gracilis', 'adductors'],
  [/rectus femoris/i, 'rectfem', 'quads'], [/vastus lateralis/i, 'vastlat', 'quads'], [/vastus medialis/i, 'vastmed', 'quads'], [/vastus intermedius/i, 'vastint', 'quads'],
  [/biceps femoris/i, 'bicfem', 'hams'], [/semitendinosus/i, 'semitend', 'hams'], [/semimembranosus/i, 'semimem', 'hams'], [/femoral intermuscular septum/i, null, 'quads'],
  [/popliteus/i, 'popliteus', 'calves'], [/gastrocnemius/i, 'gastroc', 'calves'], [/soleus/i, 'soleus', 'calves'], [/plantaris muscle/i, 'plantaris', 'calves'],
  [/calcaneal tendon/i, null, 'calves'],
  [/tibialis anterior/i, 'tibant', 'tibialis'], [/extensor digitorum longus/i, 'edl', 'tibialis'], [/extensor hallucis longus/i, 'ehl', 'tibialis'],
  [/fibularis longus/i, 'fiblong', 'tibialis'], [/fibularis brevis/i, 'fibbrev', 'tibialis'], [/fibularis tertius/i, 'fibtert', 'tibialis'],
  [/intermuscular septum of leg/i, null, 'tibialis'],
  [/tibialis posterior/i, 'tibpost', 'calves'], [/flexor digitorum longus/i, 'fdl', 'calves'], [/flexor hallucis longus/i, 'fhl', 'calves'],
  [/abductor hallucis/i, 'abdhal', 'foot'], [/flexor digitorum brevis/i, 'fdb', 'foot'], [/quadratus plantae/i, 'qplantae', 'foot'],
  [/flexor hallucis brevis/i, 'fhb', 'foot'], [/adductor hallucis/i, 'addhal', 'foot'], [/(interossei|lumbrical).*foot|plantar interossei/i, 'footint', 'foot'],
  [/extensor (digitorum|hallucis) brevis/i, 'edb', 'foot'], [/digiti minimi.*foot/i, null, 'foot'],
  [/intermuscular septum of arm/i, null, 'triceps'],
];
const BONE_RULES = [
  [/atlas|axis|vertebra c\d/i, 'cspine'], [/vertebra t\d/i, 'tspine'], [/vertebra l\d/i, 'lspine'],
  [/rib\b|sternum|costal cartilage|xiphoid/i, 'ribs'], [/sacrum|coccyx|hip bone/i, 'si'],
  [/scapula|clavicle|humerus/i, 'shoulderj'], [/radius|ulna/i, 'elbow'],
  [/capitate|hamate|lunate|pisiform|scaphoid|trapezium|trapezoid|triquetrum|metacarpal|of hand/i, 'wrist'],
  [/femur/i, 'hipj'], [/patella|tibia|fibula/i, 'knee'],
  [/talus|calcaneus|navicular|cuboid|cuneiform|metatarsal|of foot|sesamoid/i, 'ankle'],
];
const FASCIA_RULES = [
  [/thoracolumbar/i, 'f_tl'], [/iliotibial|fascia lata/i, 'f_it'], [/plantar aponeurosis|plantar fascia/i, 'f_plantar'],
  [/crural fascia|popliteal fascia|epicranial|temporal fascia|masseteric/i, 'f_back'],
  [/linea alba|rectus sheath|clavipectoral|pectoral fascia|investing cervical|transversalis|iliopsoas fascia|diaphragmatic|extensor retinaculum of ankle/i, 'f_front'],
  [/fibular retinaculum|investing abdominal/i, 'f_lateral'], [/lateral patellar retinaculum/i, 'f_it'],
];
// ситни дијелови главе/ока који се не приказују
export const HIDE = /rectus muscle$|tarsus|tendinous ring|ethmoid|incus|malleus|stapes|concha|lacrimal|vomer|palatine|nasal|alar|septal|arytenoid|corniculate|cricoid|thyroid cartilage|molar|premolar|incisor|canine|sinus of/i;

/** { zone, muscleId } за дио модела у датом слоју */
export function classifyPart(kind, base) {
  if (kind === 'fascia' && /^tensor fasciae latae$/i.test(base)) kind = 'muscles'; // мишић, само му назив садржи „fascia“
  const rules = kind === 'muscles' ? MUSCLE_RULES : kind === 'bones' ? BONE_RULES.map(([r, z]) => [r, null, z]) : FASCIA_RULES.map(([r, z]) => [r, null, z]);
  for (const [r, id, zone] of rules) if (r.test(base)) return { zone, muscleId: id };
  return { zone: null, muscleId: null };
}

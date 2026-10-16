// RAL Classic colour chart: code, French name, screen colour (sRGB approximation — the real powder may
// differ slightly on screen; the reference stays the physical RAL chart).
const RAL = [
  ['1000', 'Beige vert', '#BEBD7F'], ['1001', 'Beige', '#C2B078'], ['1002', 'Jaune sable', '#C6A664'],
  ['1003', 'Jaune de sécurité', '#E5BE01'], ['1004', 'Jaune or', '#CDA434'], ['1005', 'Jaune miel', '#A98307'],
  ['1006', 'Jaune maïs', '#E4A010'], ['1007', 'Jaune narcisse', '#DC9D00'], ['1011', 'Beige brun', '#8A6642'],
  ['1012', 'Jaune citron', '#C7B446'], ['1013', 'Blanc perlé', '#EAE6CA'], ['1014', 'Ivoire', '#E1CC4F'],
  ['1015', 'Ivoire clair', '#E6D690'], ['1016', 'Jaune soufre', '#EDFF21'], ['1017', 'Jaune safran', '#F5D033'],
  ['1018', 'Jaune zinc', '#F8F32B'], ['1019', 'Beige gris', '#9E9764'], ['1020', 'Jaune olive', '#999950'],
  ['1021', 'Jaune colza', '#F3DA0B'], ['1023', 'Jaune signalisation', '#FAD201'], ['1024', 'Jaune ocre', '#AEA04B'],
  ['1026', 'Jaune brillant', '#FFFF00'], ['1027', 'Jaune curry', '#9D9101'], ['1028', 'Jaune melon', '#F4A900'],
  ['1032', 'Jaune genêt', '#D6AE01'], ['1033', 'Jaune dahlia', '#F3A505'], ['1034', 'Jaune pastel', '#EFA94A'],
  ['1035', 'Beige nacré', '#6A5D4D'], ['1036', 'Or nacré', '#705335'], ['1037', 'Jaune soleil', '#F39F18'],
  ['2000', 'Orangé jaune', '#ED760E'], ['2001', 'Orangé rouge', '#C93C20'], ['2002', 'Orangé sang', '#CB2821'],
  ['2003', 'Orangé pastel', '#FF7514'], ['2004', 'Orangé pur', '#F44611'], ['2005', 'Orangé brillant', '#FF2301'],
  ['2007', 'Orangé clair brillant', '#FFA420'], ['2008', 'Orangé rouge clair', '#F75E25'], ['2009', 'Orangé signalisation', '#F54021'],
  ['2010', 'Orangé de sécurité', '#D84B20'], ['2011', 'Orangé foncé', '#EC7C26'], ['2012', 'Orangé saumon', '#E55137'],
  ['2013', 'Orangé nacré', '#C35831'],
  ['3000', 'Rouge feu', '#AF2B1E'], ['3001', 'Rouge de sécurité', '#A52019'], ['3002', 'Rouge carmin', '#A2231D'],
  ['3003', 'Rouge rubis', '#9B111E'], ['3004', 'Rouge pourpre', '#75151E'], ['3005', 'Rouge vin', '#5E2129'],
  ['3007', 'Rouge noir', '#412227'], ['3009', 'Rouge oxyde', '#642424'], ['3011', 'Rouge brun', '#781F19'],
  ['3012', 'Rouge beige', '#C1876B'], ['3013', 'Rouge tomate', '#A12312'], ['3014', 'Vieux rose', '#D36E70'],
  ['3015', 'Rose clair', '#EA899A'], ['3016', 'Rouge corail', '#B32821'], ['3017', 'Rosé', '#E63244'],
  ['3018', 'Rouge fraise', '#D53032'], ['3020', 'Rouge signalisation', '#CC0605'], ['3022', 'Rouge saumon', '#D95030'],
  ['3024', 'Rouge brillant', '#F80000'], ['3026', 'Rouge clair brillant', '#FE0000'], ['3027', 'Rouge framboise', '#C51D34'],
  ['3028', 'Rouge pur', '#CB3234'], ['3031', 'Rouge oriental', '#B32428'], ['3032', 'Rouge rubis nacré', '#721422'],
  ['3033', 'Rose nacré', '#B44C43'],
  ['4001', 'Lilas rouge', '#6D3F5B'], ['4002', 'Violet rouge', '#922B3E'], ['4003', 'Violet bruyère', '#DE4C8A'],
  ['4004', 'Violet bordeaux', '#641C34'], ['4005', 'Lilas bleu', '#6C4675'], ['4006', 'Pourpre signalisation', '#A03472'],
  ['4007', 'Violet pourpre', '#4A192C'], ['4008', 'Violet de sécurité', '#924E7D'], ['4009', 'Violet pastel', '#A18594'],
  ['4010', 'Télémagenta', '#CF3476'], ['4011', 'Violet nacré', '#8673A1'], ['4012', 'Mûre nacré', '#6C6874'],
  ['5000', 'Bleu violet', '#354D73'], ['5001', 'Bleu vert', '#1F3438'], ['5002', 'Bleu outremer', '#20214F'],
  ['5003', 'Bleu saphir', '#1D1E33'], ['5004', 'Bleu noir', '#18171C'], ['5005', 'Bleu de sécurité', '#1E2460'],
  ['5007', 'Bleu brillant', '#3E5F8A'], ['5008', 'Bleu gris', '#26252D'], ['5009', 'Bleu azur', '#025669'],
  ['5010', 'Bleu gentiane', '#0E294B'], ['5011', 'Bleu acier', '#231A24'], ['5012', 'Bleu clair', '#3B83BD'],
  ['5013', 'Bleu cobalt', '#1E213D'], ['5014', 'Bleu pigeon', '#606E8C'], ['5015', 'Bleu ciel', '#2271B3'],
  ['5017', 'Bleu signalisation', '#063971'], ['5018', 'Bleu turquoise', '#3F888F'], ['5019', 'Bleu capri', '#1B5583'],
  ['5020', 'Bleu océan', '#1D334A'], ['5021', 'Bleu d\'eau', '#256D7B'], ['5022', 'Bleu nocturne', '#252850'],
  ['5023', 'Bleu distant', '#49678D'], ['5024', 'Bleu pastel', '#5D9B9B'], ['5025', 'Gentiane nacré', '#2A6478'],
  ['5026', 'Bleu nuit nacré', '#102C54'],
  ['6000', 'Vert patine', '#316650'], ['6001', 'Vert émeraude', '#287233'], ['6002', 'Vert feuillage', '#2D572C'],
  ['6003', 'Vert olive', '#424632'], ['6004', 'Vert bleu', '#1F3A3D'], ['6005', 'Vert mousse', '#2F4538'],
  ['6006', 'Olive gris', '#3E3B32'], ['6007', 'Vert bouteille', '#343B29'], ['6008', 'Vert brun', '#39352A'],
  ['6009', 'Vert sapin', '#31372B'], ['6010', 'Vert herbe', '#35682D'], ['6011', 'Vert réséda', '#587246'],
  ['6012', 'Vert noir', '#343E40'], ['6013', 'Vert jonc', '#6C7156'], ['6014', 'Olive jaune', '#47402E'],
  ['6015', 'Olive noir', '#3B3C36'], ['6016', 'Vert turquoise', '#1E5945'], ['6017', 'Vert mai', '#4C9141'],
  ['6018', 'Vert jaune', '#57A639'], ['6019', 'Vert blanc', '#BDECB6'], ['6020', 'Vert oxyde chromique', '#2E3A23'],
  ['6021', 'Vert pâle', '#89AC76'], ['6022', 'Olive brun', '#25221B'], ['6024', 'Vert signalisation', '#308446'],
  ['6025', 'Vert fougère', '#3D642D'], ['6026', 'Vert opale', '#015D52'], ['6027', 'Vert clair', '#84C3BE'],
  ['6028', 'Vert pin', '#2C5545'], ['6029', 'Vert menthe', '#20603D'], ['6032', 'Vert de sécurité', '#317F43'],
  ['6033', 'Turquoise menthe', '#497E76'], ['6034', 'Turquoise pastel', '#7FB5B5'], ['6035', 'Vert nacré', '#1C542D'],
  ['6036', 'Vert opale nacré', '#193737'], ['6037', 'Vert pur', '#008F39'], ['6038', 'Vert brillant', '#00BB2D'],
  ['7000', 'Gris petit-gris', '#78858B'], ['7001', 'Gris argent', '#8A9597'], ['7002', 'Gris olive', '#7E7B52'],
  ['7003', 'Gris mousse', '#6C7059'], ['7004', 'Gris de sécurité', '#969992'], ['7005', 'Gris souris', '#646B63'],
  ['7006', 'Gris beige', '#6D6552'], ['7008', 'Gris kaki', '#6A5F31'], ['7009', 'Gris vert', '#4D5645'],
  ['7010', 'Gris tente', '#4C514A'], ['7011', 'Gris fer', '#434B4D'], ['7012', 'Gris basalte', '#4E5754'],
  ['7013', 'Gris brun', '#464531'], ['7015', 'Gris ardoise', '#434750'], ['7016', 'Gris anthracite', '#293133'],
  ['7021', 'Gris noir', '#23282B'], ['7022', 'Gris terre d\'ombre', '#332F2C'], ['7023', 'Gris béton', '#686C5E'],
  ['7024', 'Gris graphite', '#474A51'], ['7026', 'Gris granit', '#2F353B'], ['7030', 'Gris pierre', '#8B8C7A'],
  ['7031', 'Gris bleu', '#474B4E'], ['7032', 'Gris silex', '#B8B799'], ['7033', 'Gris ciment', '#7D8471'],
  ['7034', 'Gris jaune', '#8F8B66'], ['7035', 'Gris clair', '#D7D7D7'], ['7036', 'Gris platine', '#7F7679'],
  ['7037', 'Gris poussière', '#7D7F7D'], ['7038', 'Gris agate', '#B5B8B1'], ['7039', 'Gris quartz', '#6C6960'],
  ['7040', 'Gris fenêtre', '#9DA1AA'], ['7042', 'Gris signalisation A', '#8D948D'], ['7043', 'Gris signalisation B', '#4E5452'],
  ['7044', 'Gris soie', '#CAC4B0'], ['7045', 'Télégris 1', '#909090'], ['7046', 'Télégris 2', '#82898F'],
  ['7047', 'Télégris 4', '#D0D0D0'], ['7048', 'Gris souris nacré', '#898176'],
  ['7760', 'Gris givré', '#383E42'], 
  ['8000', 'Brun vert', '#826C34'], ['8001', 'Brun terre de Sienne', '#955F20'], ['8002', 'Brun de sécurité', '#6C3B2A'],
  ['8003', 'Brun argile', '#734222'], ['8004', 'Brun cuivré', '#8E402A'], ['8007', 'Brun fauve', '#59351F'],
  ['8008', 'Brun olive', '#6F4F28'], ['8011', 'Brun noisette', '#5B3A29'], ['8012', 'Brun rouge', '#592321'],
  ['8014', 'Brun sépia', '#382C1E'], ['8015', 'Marron', '#633A34'], ['8016', 'Brun acajou', '#4C2F27'],
  ['8017', 'Brun chocolat', '#45322E'], ['8019', 'Brun gris', '#403A3A'], ['8022', 'Brun noir', '#212121'],
  ['8023', 'Brun orangé', '#A65E2E'], ['8024', 'Brun beige', '#79553D'], ['8025', 'Brun pâle', '#755C48'],
  ['8028', 'Brun terre', '#4E3B31'], ['8029', 'Cuivre nacré', '#763C28'],
  ['9001', 'Blanc crème', '#FDF4E3'], ['9002', 'Blanc gris', '#E7EBDA'], ['9003', 'Blanc de sécurité', '#F4F4F4'],
  ['9004', 'Noir de sécurité', '#282828'], ['9005', 'Noir foncé', '#0A0A0A'], ['9006', 'Aluminium blanc', '#A5A5A5'],
  ['9007', 'Aluminium gris', '#8F8F8F'], ['9010', 'Blanc pur', '#FFFFFF'], ['9011', 'Noir graphite', '#1C1C1C'],
  ['9016', 'Blanc signalisation', '#F6F6F6'], ['9017', 'Noir signalisation', '#1E1E1E'], ['9018', 'Blanc papyrus', '#D7D7D7'],
  ['9022', 'Gris clair nacré', '#9C9C9C'], ['9023', 'Gris foncé nacré', '#828282'],
];

export const RAL_COLORS = RAL.map(([code, name, hex]) => ({ code: `RAL ${code}`, num: code, name, hex }));

const norm = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// « RAL 9010 », « ral9010 », « 9010 mat », « Blanc pur RAL 9010 » → the chart entry, else null
export function findRal(text) {
  const m = String(text || '').match(/(?:^|\D)([1-9]\d{3})(?!\d)/);
  return m ? RAL_COLORS.find(r => r.num === m[1]) || null : null;
}

// search by number (« 90 », « 9010 ») or by words of the name (« gris anth »)
export function searchRal(q) {
  const words = norm(q).replace(/\bral\b/g, ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return RAL_COLORS;
  return RAL_COLORS.filter(r => {
    const hay = `${r.num} ${norm(r.name)}`;
    return words.every(w => hay.includes(w));
  });
}

// readable text on top of a colour
export function inkOn(hex) {
  const h = String(hex || '').replace('#', '');
  if (h.length !== 6) return '#111';
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#111111' : '#ffffff';
}

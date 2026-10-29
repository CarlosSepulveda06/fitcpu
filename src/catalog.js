// Catálogo base de alimentos comunes en México.
// Valores aproximados por 100 g (kcal, proteína, carbohidratos, grasa) y una porción típica.
// [nombre, emoji, kcal, proteína, carbs, grasa, unidad, gramos por unidad]
const RAW = [
["Huevo","🥚",143,12.6,0.7,9.5,"pieza",50],["Clara de huevo","🥚",52,10.9,0.7,0.2,"clara",33],
["Jamón de pierna de cerdo","🥓",103,17,1.5,3,"rebanada",30],["Jamón de pavo","🥓",100,15,3,3,"rebanada",20],
["Salchicha de pavo","🌭",160,12,4,11,"pieza",40],["Tocino cocido","🥓",541,37,1.4,42,"tira",8],["Chorizo","🌭",455,24,2,38,"porción",50],
["Pechuga de pollo (peso crudo)","🍗",120,22.5,0,2.6,"filete",150],["Pechuga de pollo cocida","🍗",165,31,0,3.6,"pieza",120],
["Muslo de pollo con piel cocido","🍗",229,25,0,14,"pieza",100],["Carne molida de res 90/10 (cruda)","🥩",176,20,0,10,"porción",120],
["Bistec de res cocido","🥩",200,29,0,9,"bistec",150],["Arrachera cocida","🥩",230,27,0,13,"porción",150],
["Salmón (peso crudo)","🐟",208,20,0,13,"filete",120],["Tilapia (peso crudo)","🐟",96,20,0,1.7,"filete",120],
["Atún en agua (drenado)","🐟",116,25.5,0,0.8,"lata",100],["Camarón cocido","🦐",99,24,0.2,0.3,"porción",100],
["Chicharrón de cerdo","🥓",544,61,0,31,"porción",30],["Tofu firme","🧈",144,17,3,9,"porción",100],
["Queso panela","🧀",250,18,3,18,"rebanada",30],["Queso Oaxaca","🧀",320,22,2,25,"porción",30],["Queso cheddar","🧀",403,25,1.3,33,"rebanada",20],
["Leche entera","🥛",61,3.2,4.8,3.3,"vaso",240],["Leche descremada","🥛",34,3.4,5,0.1,"vaso",240],
["Yogur griego natural sin azúcar","🥣",59,10,3.6,0.4,"taza",170],["Yogur natural entero","🥣",61,3.5,4.7,3.3,"taza",245],
["Proteína whey (polvo)","🥤",400,80,8,6,"scoop",30],
["Arroz blanco (peso cocido)","🍚",130,2.7,28,0.3,"taza",160],["Arroz rojo (cocido)","🍚",150,3,28,3,"taza",160],
["Frijoles de olla","🫘",143,9,26,0.6,"taza",170],["Frijoles refritos","🫘",150,7,18,6,"½ taza",120],
["Lentejas cocidas","🫘",116,9,20,0.4,"taza",200],["Garbanzo cocido","🫘",164,8.9,27,2.6,"taza",160],
["Tortilla de maíz","🫓",218,5.7,44.6,2.9,"pieza",30],["Tortilla de harina","🫓",304,8,50,8,"pieza",45],
["Pan blanco de caja","🍞",265,9,49,3.2,"rebanada",28],["Pan integral","🍞",247,13,41,3.4,"rebanada",30],["Bolillo","🥖",280,9,56,2,"pieza",70],
["Avena en hojuelas (cruda)","🥣",389,16.9,66,6.9,"½ taza",40],["Cereal de maíz","🥣",357,7.5,84,0.4,"taza",30],["Granola","🥣",471,10,64,20,"¼ taza",30],
["Pasta (peso cocido)","🍝",158,5.8,31,0.9,"taza",140],["Papa cocida","🥔",87,1.9,20,0.1,"pieza",150],["Camote cocido","🍠",90,2,21,0.2,"pieza",150],
["Elote cocido","🌽",96,3.4,21,1.5,"pieza",100],["Hot cakes","🥞",227,6.4,28,10,"pieza",75],["Galletas María","🍪",440,7,75,12,"4 piezas",25],
["Plátano","🍌",89,1.1,23,0.3,"pieza",118],["Manzana","🍎",52,0.3,14,0.2,"pieza",180],["Naranja","🍊",47,0.9,12,0.1,"pieza",130],
["Papaya","🍈",43,0.5,11,0.3,"taza",145],["Mango","🥭",60,0.8,15,0.4,"taza",165],["Fresas","🍓",32,0.7,7.7,0.3,"taza",150],["Sandía","🍉",30,0.6,7.6,0.2,"taza",150],
["Aguacate","🥑",160,2,8.5,14.7,"½ pieza",70],["Jitomate","🍅",18,0.9,3.9,0.2,"pieza",120],["Lechuga","🥬",15,1.4,2.9,0.2,"taza",47],
["Pepino","🥒",15,0.7,3.6,0.1,"taza",120],["Brócoli cocido","🥦",35,2.4,7.2,0.4,"taza",156],["Verduras al vapor","🥗",30,1.5,6,0.2,"taza",90],
["Nopales cocidos","🌵",15,1.4,3.3,0.1,"taza",150],["Calabacita cocida","🥒",15,1.1,2.7,0.4,"taza",180],["Zanahoria","🥕",41,0.9,10,0.2,"pieza",60],
["Aceite de oliva","🫒",884,0,0,100,"cda",14],["Aceite vegetal","🫗",884,0,0,100,"cda",14],["Mantequilla","🧈",717,0.9,0.1,81,"cda",14],
["Mayonesa","🫙",680,1,0.6,75,"cda",14],["Crema de cacahuate","🥜",588,25,20,50,"cda",16],["Almendras","🌰",579,21,22,50,"puño",28],
["Cacahuates","🥜",567,26,16,49,"puño",28],["Nuez","🌰",654,15,14,65,"puño",28],["Guacamole","🥑",150,2,8.5,13.5,"¼ taza",60],
["Salsa roja","🌶️",30,1,6,0.5,"2 cdas",30],["Totopos","🌮",489,7,64,23,"puño",30],["Miel","🍯",304,0.3,82,0,"cda",21],
["Mermelada","🍓",278,0.4,69,0.1,"cda",20],["Azúcar","🍬",387,0,100,0,"cdita",4],
["Taco al pastor","🌮",220,12,18,11,"taco",80],["Quesadilla de maíz con queso","🫓",280,12,26,14,"pieza",90],
["Tamal","🫔",220,7,22,12,"pieza",130],["Pozole rojo","🍲",70,5,6,3,"plato",400],["Sopa de fideo","🍜",60,2,9,1.8,"plato",300],
["Pizza de pepperoni","🍕",298,12,34,13,"rebanada",110],["Hamburguesa sencilla","🍔",250,13,25,11,"pieza",200],["Papas fritas","🍟",312,3.4,41,15,"orden",117],
["Refresco de cola","🥤",42,0,10.6,0,"lata",355],["Refresco sin azúcar","🥤",0,0,0,0,"lata",355],["Jugo de naranja","🧃",45,0.7,10.4,0.2,"vaso",240],
["Cerveza","🍺",43,0.5,3.6,0,"lata",355],["Café americano","☕",2,0.3,0,0,"taza",240]
];

export const CATALOG = RAW.map((r, i) => ({
  id: "c" + i, name: r[0], emoji: r[1], k: r[2], p: r[3], c: r[4], f: r[5], unit: r[6], g: r[7], src: "base",
}));

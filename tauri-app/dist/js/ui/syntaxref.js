// syntaxref.js —— 语法对照表(文件菜单 → 语法):十语种命令对照
// 数据即引擎 registry 的镜像:别名列展示的都是引擎真实接受的写法。
'use strict';

// 每行:[英文示例, 各语言 [语言键, 别名, 含义]]
// 语言键:en/zh/es/de/ru/ja/fr/pt/ko/ar
var SYN_ROWS=[
 ['@[page A4]',[
  ['en','page','Page size (A4/Letter/B5/A3/A5)'],
  ['zh','页面','页面尺寸(A4/Letter/B5/A3/A5)'],
  ['es','página','Tamaño de página (A4/Letter/B5/A3/A5)'],
  ['de','Seite','Seitengröße (A4/Letter/B5/A3/A5)'],
  ['ru','страница','Размер страницы (A4/Letter/B5/A3/A5)'],
  ['ja','ページ','ページサイズ(A4/Letter/B5/A3/A5)'],
  ['fr','page','Taille de page (A4/Letter/B5/A3/A5)'],
  ['pt','página','Tamanho da página (A4/Letter/B5/A3/A5)'],
  ['ko','페이지','페이지 크기(A4/Letter/B5/A3/A5)'],
  ['ar','صفحة','حجم الصفحة (A4/Letter/B5/A3/A5)'],
 ]],
 ['@[margin 20mm]',[
  ['en','margin','Page margins'],
  ['zh','边距','页边距'],
  ['es','margen','Márgenes'],
  ['de','Rand','Seitenränder'],
  ['ru','поле','Поля страницы'],
  ['ja','余白','余白'],
  ['fr','marge','Marges'],
  ['pt','margem','Margens'],
  ['ko','여백','여백'],
  ['ar','هامش','هوامش الصفحة'],
 ]],
 ['@[line-spacing 1.9]',[
  ['en','line-spacing','Line spacing'],
  ['zh','行距','行距'],
  ['es','interlineado','Interlineado'],
  ['de','Zeilenabstand','Zeilenabstand'],
  ['ru','интерлиньяж','Межстрочный интервал'],
  ['ja','行間','行間'],
  ['fr','interligne','Interligne'],
  ['pt','entrelinha','Entrelinha'],
  ['ko','줄간격','줄간격'],
  ['ar','تباعد','تباعد الأسطر'],
 ]],
 ['@[first-line 2em]',[
  ['en','first-line','First-line indent'],
  ['zh','首行缩进','首行缩进'],
  ['es','sangría','Sangría'],
  ['de','Einzug','Erstzeileneinzug'],
  ['ru','отступ','Красная строка'],
  ['ja','字下げ','字下げ'],
  ['fr','alinéa','Alinéa'],
  ['pt','recuo','Recuo'],
  ['ko','들여쓰기','들여쓰기'],
  ['ar','بادئة','مسافة بادئة'],
 ]],
 ['@[para-spacing 0.5em]',[
  ['en','para-spacing','Paragraph spacing'],
  ['zh','段距','段落间距'],
  ['es','espaciado','Espacio entre párrafos'],
  ['de','Absatzabstand','Absatzabstand'],
  ['ru','отбивка','Отбивка между абзацами'],
  ['ja','間隔','段落間隔'],
  ['fr','espacement','Espacement des paragraphes'],
  ['pt','espaçamento','Espaço entre parágrafos'],
  ['ko','문단간격','문단 간격'],
  ['ar','فاصل','تباعد الفقرات'],
 ]],
 ['@[toc depth: 3]',[
  ['en','toc','Table of contents'],
  ['zh','目录','目录'],
  ['es','índice','Índice'],
  ['de','Verzeichnis','Inhaltsverzeichnis'],
  ['ru','содержание','Оглавление'],
  ['ja','目次','目次'],
  ['fr','sommaire','Sommaire'],
  ['pt','sumário','Sumário'],
  ['ko','목차','목차'],
  ['ar','فهرس','الفهرس'],
 ]],
 ['@[theme name]',[
  ['en','theme','Theme'],
  ['zh','主题','主题'],
  ['es','tema','Tema'],
  ['de','Design','Design'],
  ['ru','тема','Тема'],
  ['ja','テーマ','テーマ'],
  ['fr','thème','Thème'],
  ['pt','tema','Tema'],
  ['ko','테마','테마'],
  ['ar','سمة','السمة'],
 ]],
 ['@[numbering on]',[
  ['en','numbering','Heading numbering'],
  ['zh','编号','标题编号'],
  ['es','numeración','Numeración'],
  ['de','Numerierung','Nummerierung'],
  ['ru','нумерация','Нумерация'],
  ['ja','番号','番号付け'],
  ['fr','numérotation','Numérotation'],
  ['pt','numeração','Numeração'],
  ['ko','번호','번호 매기기'],
  ['ar','ترقيم','ترقيم العناوين'],
 ]],
 ['@[image "a.png"]',[
  ['en','image','Insert image'],
  ['zh','图片','插入图片'],
  ['es','imagen','Insertar imagen'],
  ['de','Bild','Bild einfügen'],
  ['ru','изображение','Вставить изображение'],
  ['ja','画像','画像挿入'],
  ['fr','image','Insérer une image'],
  ['pt','imagem','Inserir imagem'],
  ['ko','이미지','이미지 삽입'],
  ['ar','صورة','إدراج صورة'],
 ]],
 ['@[figure "b.png"]',[
  ['en','figure','Illustration block'],
  ['zh','插图','插图块'],
  ['es','figura','Figura'],
  ['de','Abbildung','Abbildung'],
  ['ru','иллюстрация','Иллюстрация'],
  ['ja','図','図ブロック'],
  ['fr','figure','Figure'],
  ['pt','figura','Figura'],
  ['ko','그림','그림 블록'],
  ['ar','شكل','كتلة توضيحية'],
 ]],
 ['@[table t]…@[/table]',[
  ['en','table','Table'],
  ['zh','表格','表格'],
  ['es','tabla','Tabla'],
  ['de','Tabelle','Tabelle'],
  ['ru','таблица','Таблица'],
  ['ja','表','表'],
  ['fr','tableau','Tableau'],
  ['pt','tabela','Tabela'],
  ['ko','표','표'],
  ['ar','جدول','جدول'],
 ]],
 ['@[cell span: 2]…@[/cell]',[
  ['en','cell','Table cell options'],
  ['zh','单元格','单元格属性'],
  ['es','celda','Celda'],
  ['de','Zelle','Zelle'],
  ['ru','ячейка','Ячейка'],
  ['ja','セル','セル属性'],
  ['fr','cellule','Cellule'],
  ['pt','célula','Célula'],
  ['ko','셀','셀 옵션'],
  ['ar','خلية','خيارات الخلية'],
 ]],
 ['@[font "Times"]…@[/font]',[
  ['en','font','Font'],
  ['zh','字体','字体'],
  ['es','fuente','Fuente'],
  ['de','Schrift','Schrift'],
  ['ru','шрифт','Шрифт'],
  ['ja','フォント','フォント'],
  ['fr','police','Police'],
  ['pt','fonte','Fonte'],
  ['ko','글꼴','글꼴'],
  ['ar','خط','الخط'],
 ]],
 ['@[size 14]…@[/size]',[
  ['en','size','Font size'],
  ['zh','字号','字号'],
  ['es','tamaño','Tamaño'],
  ['de','Größe','Schriftgröße'],
  ['ru','размер','Размер'],
  ['ja','サイズ','サイズ'],
  ['fr','taille','Taille'],
  ['pt','tamanho','Tamanho'],
  ['ko','크기','크기'],
  ['ar','حجم','الحجم'],
 ]],
 ['@[color #cc0000]…@[/color]',[
  ['en','color','Text color'],
  ['zh','颜色','文字颜色'],
  ['es','color','Color'],
  ['de','Farbe','Farbe'],
  ['ru','цвет','Цвет'],
  ['ja','色','色'],
  ['fr','couleur','Couleur'],
  ['pt','cor','Cor'],
  ['ko','색','색'],
  ['ar','لون','لون النص'],
 ]],
 ['@[u]…@[/u]',[
  ['en','u / underline','Underline'],
  ['zh','下划线 / 下划','下划线'],
  ['es','subrayado','Subrayado'],
  ['de','Unterstreichung','Unterstreichen'],
  ['ru','подчерк','Подчёркнутый'],
  ['ja','下線','下線'],
  ['fr','souligner','Souligné'],
  ['pt','sublinhado','Sublinhado'],
  ['ko','밑줄','밑줄'],
  ['ar','تسطير','تسطير'],
 ]],
 ['@[sup]…@[/sup]',[
  ['en','sup','Superscript'],
  ['zh','上标','上标'],
  ['es','superíndice','Superíndice'],
  ['de','hochgestellt','Hochgestellt'],
  ['ru','надстрочный','Надстрочный'],
  ['ja','上付き','上付き'],
  ['fr','exposant','Exposant'],
  ['pt','sobrescrito','Sobrescrito'],
  ['ko','위첨자','위첨자'],
  ['ar','مرتفع','مرتفع'],
 ]],
 ['@[sub]…@[/sub]',[
  ['en','sub','Subscript'],
  ['zh','下标','下标'],
  ['es','subíndice','Subíndice'],
  ['de','tiefgestellt','Tiefgestellt'],
  ['ru','подстрочный','Подстрочный'],
  ['ja','下付き','下付き'],
  ['fr','indice','Indice'],
  ['pt','subscrito','Subscrito'],
  ['ko','아래첨자','아래첨자'],
  ['ar','منخفض','منخفض'],
 ]],
 ['@[mark yellow]…@[/mark]',[
  ['en','mark','Highlight'],
  ['zh','底纹','底纹高亮'],
  ['es','resaltado','Resaltado'],
  ['de','Markierung','Markierung'],
  ['ru','выделение','Выделение'],
  ['ja','ハイライト','ハイライト'],
  ['fr','surlignage','Surlignage'],
  ['pt','realce','Realce'],
  ['ko','형광','형광판'],
  ['ar','تظليل','تظليل'],
 ]],
 ['@[link 文本 url: …]',[
  ['en','link','Hyperlink'],
  ['zh','链接','超链接'],
  ['es','enlace','Hipervínculo'],
  ['de','—','Hyperlink'],
  ['ru','ссылка','Гиперссылка'],
  ['ja','リンク','リンク'],
  ['fr','lien','Lien'],
  ['pt','ligação','Hiperlink'],
  ['ko','링크','하이퍼링크'],
  ['ar','رابط','ارتباط تشعبي'],
 ]],
 ['@[ref label] / @[引用 label]',[
  ['en','ref','Cross-reference'],
  ['zh','引用','交叉引用'],
  ['es','—','Referencia cruzada'],
  ['de','Verweis','Querverweis'],
  ['ru','отсылка','Перекрёстная ссылка'],
  ['ja','—','相互参照'],
  ['fr','—','Renvoi'],
  ['pt','referência','Referência cruzada'],
  ['ko','참조','상호 참조'],
  ['ar','مرجع','مرجع متبادل'],
 ]],
 ['@[label h1]',[
  ['en','label','Bookmark / label'],
  ['zh','标签','书签标签'],
  ['es','etiqueta','Etiqueta'],
  ['de','Marke','Marke'],
  ['ru','метка','Метка'],
  ['ja','ラベル','ラベル'],
  ['fr','étiquette','Étiquette'],
  ['pt','rótulo','Rótulo'],
  ['ko','레이블','레이블'],
  ['ar','علامة','علامة'],
 ]],
 ['@[footnote 1 注文]',[
  ['en','footnote','Footnote'],
  ['zh','脚注','脚注'],
  ['es','nota','Nota'],
  ['de','Fußnote','Fußnote'],
  ['ru','сноска','Сноска'],
  ['ja','脚注','脚注'],
  ['fr','note','Note'],
  ['pt','nota','Nota'],
  ['ko','각주','각주'],
  ['ar','حاشية','حاشية سفلية'],
 ]],
 ['@[comment …]…@[/comment]',[
  ['en','comment','Comment (not rendered)'],
  ['zh','批注','批注(不参与渲染)'],
  ['es','comentario','Comentario (no se renderiza)'],
  ['de','Kommentar','Kommentar (ohne Renderung)'],
  ['ru','комментарий','Комментарий (не выводится)'],
  ['ja','コメント','コメント(表示されない)'],
  ['fr','commentaire','Commentaire (non rendu)'],
  ['pt','comentário','Comentário (não renderizado)'],
  ['ko','주석','주석(렌더링 안 됨)'],
  ['ar','تعليق','تعليق (لا يُعرض)'],
 ]],
 ['@[m]E=mc^2@[/m]',[
  ['en','math / m','Math formula'],
  ['zh','数学 / m','数学公式'],
  ['es','matemática','Fórmula'],
  ['de','Formel','Formel'],
  ['ru','формула','Формула'],
  ['ja','数式','数式'],
  ['fr','formule','Formule'],
  ['pt','fórmula','Fórmula'],
  ['ko','수식','수식'],
  ['ar','معادلة','معادلة'],
 ]],
 ['@[c]…@[/c]',[
  ['en','code / c','Code block'],
  ['zh','代码 / c','代码块'],
  ['es','código','Código'],
  ['de','—','Codeblock'],
  ['ru','код','Код'],
  ['ja','コード','コードブロック'],
  ['fr','—','Bloc de code'],
  ['pt','código','Bloco de código'],
  ['ko','코드','코드 블록'],
  ['ar','رمز','كتلة رمز'],
 ]],
 ['**粗体** _斜体_ ~~删除~~',[
  ['en','markdown bold/italic/strike','Markdown inline'],
  ['zh','同写法','Markdown 行内标记,各语言同写法'],
  ['es','igual','Marcas Markdown'],
  ['de','gleich','Markdown-Markup'],
  ['ru','то же','Разметка Markdown'],
  ['ja','同じ','Markdown 記法'],
  ['fr','identique','Marques Markdown'],
  ['pt','igual','Marcação Markdown'],
  ['ko','동일','마크다운 표기'],
  ['ar','نفسه','ترميز ماركداون'],
 ]],
];
var SYN_LANGS=[
 ['en','English'],['zh','简体中文'],['es','Español'],['de','Deutsch'],
 ['ru','Русский'],['ja','日本語'],['fr','Français'],['pt','Português'],
 ['ko','한국어'],['ar','العربية'],
];
var SYN_CUR='zh';
function openSyntaxRef(){
  toggleFileMenu();
  var d=document.getElementById('syntax-ref');
  if(!d){ buildSyntaxRef(); d=document.getElementById('syntax-ref') }
  d.style.display='flex';
  renderSyntaxChips();
  renderSyntaxTable();
}
function closeSyntaxRef(){
  var d=document.getElementById('syntax-ref');
  if(d)d.style.display='none';
}
function buildSyntaxRef(){
  var d=document.createElement('div');
  d.id='syntax-ref'; d.className='syntax-ref';
  d.innerHTML='<div class="sr-card">'
   +'<div class="sr-head"><span class="sr-title">语法对照 · Syntax Reference</span>'
   +'<button class="sr-close" onclick="closeSyntaxRef()"><i class="fa-solid fa-xmark"></i></button></div>'
   +'<div class="sr-chips" id="sr-chips"></div>'
   +'<div class="sr-body" id="sr-body"></div>'
   +'</div>';
  d.addEventListener('click',function(e){ if(e.target===d)closeSyntaxRef() });
  document.body.appendChild(d);
}
function renderSyntaxChips(){
  var box=document.getElementById('sr-chips');
  var h='';
  SYN_LANGS.forEach(function(l){
    h+='<button class="sr-chip'+(SYN_CUR===l[0]?' on':'')+'" onclick="SYN_CUR=\''+l[0]+'\';renderSyntaxChips();renderSyntaxTable()">'+l[1]+'</button>';
  });
  box.innerHTML=h;
}
function synPick(row,lang){
  for(var i=0;i<row[1].length;i++){ if(row[1][i][0]===lang)return row[1][i] }
  return null;
}
function renderSyntaxTable(){
  var body=document.getElementById('sr-body');
  var langName='';
  SYN_LANGS.forEach(function(l){ if(l[0]===SYN_CUR)langName=l[1] });
  var rtl=(SYN_CUR==='ar');
  var h='<table class="sr-table"><thead><tr>'
   +'<th>英文语法</th><th>对应'+langName+'语法</th><th>含义'+(SYN_CUR!=='zh'&&SYN_CUR!=='en'?' / 含义翻译':'')+'</th>'
   +'</tr></thead><tbody>';
  SYN_ROWS.forEach(function(row){
    var pick=synPick(row,SYN_CUR);
    var alias=pick?pick[1]:'—';
    var mean=pick?pick[2]:'—';
    if(alias!=='—'&&alias.charAt(0)!=='—'){
      // 用本地别名替换示例中的命令词,给出可输入的本地写法
      var m=row[0].match(/^@\[([^\s\]]+)/);
      if(m&&m[1]&&alias!=='—'){
        var en=m[1];
        if(en.indexOf('/')<0&&alias!=='—'){
          alias=row[0].replace('@['+en,'@['+alias);
        }
      }
    }
    h+='<tr><td><code>'+Engine.escHtml(row[0])+'</code></td>'
     +'<td><code'+(rtl?' dir="rtl"':'')+'>'+Engine.escHtml(alias)+'</code></td>'
     +'<td'+(rtl?' dir="rtl"':'')+'>'+Engine.escHtml(mean)+'</td></tr>';
  });
  h+='</tbody></table>';
  body.innerHTML=h;
}

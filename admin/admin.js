const loginForm=document.getElementById("adminLoginForm");
const loginMessage=document.getElementById("loginMessage");
const loginCard=document.getElementById("loginCard");
const dashboardShell=document.getElementById("dashboardShell");
const logoutBtn=document.getElementById("logoutBtn");
const productForm=document.getElementById("productForm");
const productMessage=document.getElementById("productMessage");
const productsBody=document.getElementById("productsBody");
const catalogStatus=document.getElementById("catalogStatus");
let selectedImages=["","",""];
let editSelectedImages=["","",""];
let productsCache=[];
let productsFilteredCache=[];
let productsPage=1;
const productsSearchInput=document.getElementById("productsSearch");
const PRODUCTS_PER_PAGE=8;

function showMessage(text){if(loginMessage)loginMessage.textContent=text}
function showProductMessage(text){if(productMessage)productMessage.textContent=text}
function showDashboard(){loginCard.hidden=true;dashboardShell.hidden=false}
function showLogin(){dashboardShell.hidden=true;loginCard.hidden=false}
function esc(v){return String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;")}
function money(v){return Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}
function cat(v){return({"brand-masc":"Brand Collection Masc.","brand-fem":"Brand Collection Fem.","arabe-masc":"Perfumes Árabes Masc.","arabe-fem":"Perfumes Árabes Fem.","compartilhaveis":"Compartilháveis","infantil":"Infantil","body-splash":"Body Splash","arabic-collection":"Arabic Collection","kits":"Kits","outlet":"Outlet","decants":"Decants"})[v]||v||"—"}

async function api(url,options={}){
 const response=await fetch(url,{credentials:"same-origin",cache:"no-store",...options});
 const data=await response.json().catch(()=>({}));
 if(response.status===401){showLogin();throw new Error("Sua sessão administrativa expirou.")}
 if(!response.ok){
  const err=new Error(data.error||"Não foi possível concluir a operação.");
  err.httpStatus=response.status;
  err.apiResponse=data;
  throw err;
 }
 return data;
}

function renderProductsPagination(total){
 const el=document.getElementById("productsPagination");
 if(!el)return;
 const pages=Math.max(1,Math.ceil(total/PRODUCTS_PER_PAGE));
 productsPage=Math.min(productsPage,pages);
 if(pages<=1){el.innerHTML="";return;}
 el.innerHTML=`<button type="button" class="pagination-btn" data-products-page="prev" ${productsPage===1?"disabled":""}>Anterior</button>
  <span class="pagination-info">Página ${productsPage} de ${pages}</span>
  <button type="button" class="pagination-btn" data-products-page="next" ${productsPage===pages?"disabled":""}>Próxima</button>`;
 el.querySelector('[data-products-page="prev"]')?.addEventListener("click",()=>{productsPage--;renderProductsPage()});
 el.querySelector('[data-products-page="next"]')?.addEventListener("click",()=>{productsPage++;renderProductsPage()});
}

function renderProductsPage(){
 if(!productsBody)return;
 const source=productsFilteredCache;
 const pages=Math.max(1,Math.ceil(source.length/PRODUCTS_PER_PAGE));
 productsPage=Math.min(productsPage,pages);
 const start=(productsPage-1)*PRODUCTS_PER_PAGE;
 const page=source.slice(start,start+PRODUCTS_PER_PAGE);
 if(!page.length){productsBody.innerHTML=`<tr><td colspan="8" class="empty-table">${productsCache.length?'Nenhum produto encontrado para essa pesquisa.':'Nenhum produto cadastrado.'}</td></tr>`;renderProductsPagination(0);return;}
 productsBody.innerHTML=page.map(p=>`<tr>
   <td>${p.image?`<img class="product-thumb" src="${esc(p.image)}" alt="${esc(p.name)}">`:"—"}</td>
   <td>${esc(p.name)}</td><td>${esc(p.brand||"—")}</td><td>${esc(cat(p.category))}</td>
   <td>${p.category==="decants"?"5 ml / 10 ml":(p.volume?Number(p.volume)+" ml":"—")}</td>
   <td>${p.category==="decants"?`5 ml: ${money(p.decantPrices?.["5"])}<br>10 ml: ${money(p.decantPrices?.["10"])}`:(p.originalPrice&&Number(p.originalPrice)>Number(p.price)?`<del>${money(p.originalPrice)}</del><br>${money(p.price)}`:money(p.price))}</td>
   <td>${Number(p.stock||0)}</td><td class="product-actions"><button class="edit-link" type="button" data-edit="${esc(p.id)}">editar</button><button class="remove-link" type="button" data-delete="${esc(p.id)}">remover</button></td>
  </tr>`).join("");
 productsBody.querySelectorAll("[data-edit]").forEach(btn=>btn.addEventListener("click",()=>openProductEdit(btn.dataset.edit)));
 productsBody.querySelectorAll("[data-delete]").forEach(btn=>btn.addEventListener("click",async()=>{
   const name=btn.closest("tr")?.children[1]?.textContent||"este produto";
   if(!confirm(`Remover o produto "${name}"?`))return;
   try{await api(`/api/admin/products/${encodeURIComponent(btn.dataset.delete)}`,{method:"DELETE"});showProductMessage("Produto removido com sucesso.");await loadProducts()}
   catch(e){showProductMessage(e.message)}
 }));
 renderProductsPagination(source.length);
}

function applyProductsSearch(){
 const query=String(productsSearchInput?.value||"").trim().toLocaleLowerCase("pt-BR");
 productsFilteredCache=!query?productsCache:productsCache.filter(p=>`${p.name||""} ${p.brand||""} ${cat(p.category)}`.toLocaleLowerCase("pt-BR").includes(query));
 productsPage=1;
 renderProductsPage();
}
productsSearchInput?.addEventListener("input",applyProductsSearch);

function openProductEdit(id){
 const product=productsCache.find(p=>String(p.id)===String(id));
 if(!product)return;
 const modal=document.getElementById("productEditModal");
 const body=document.getElementById("productEditBody");
 if(!modal||!body)return;

 const currentImages=(Array.isArray(product.images)&&product.images.length?product.images:[product.image]).filter(Boolean).slice(0,3);
 editSelectedImages=[currentImages[0]||"",currentImages[1]||"",currentImages[2]||""];

 body.innerHTML=`<div class="edit-product-grid">
  <div><label for="editName">Nome do produto</label><input id="editName" value="${esc(product.name)}" required></div>
  <div><label for="editBrand">Marca</label><input id="editBrand" value="${esc(product.brand||"")}"></div>
  <div><label for="editCat">Categoria</label><select id="editCat">
   <option value="brand-masc">Brand Collection Masc.</option><option value="brand-fem">Brand Collection Fem.</option><option value="arabe-masc">Perfumes Árabes Masc.</option><option value="arabe-fem">Perfumes Árabes Fem.</option><option value="compartilhaveis">Compartilháveis</option><option value="infantil">Infantil</option><option value="body-splash">Body Splash</option><option value="arabic-collection">Arabic Collection</option><option value="kits">Kits</option><option value="outlet">Outlet</option><option value="decants">Decants</option>
  </select></div>
  <div><label for="editGender">Gênero</label><select id="editGender"><option value="feminino">Feminino</option><option value="masculino">Masculino</option><option value="unissex">Unissex</option></select></div>
  <div><label for="editVolume">Volume (ml)</label><input id="editVolume" type="number" min="0" step="1" value="${Number(product.volume||0)}"></div>
  <div id="editStandardPriceField"><label for="editPrice">Preço de venda</label><input id="editPrice" type="number" min="0" step="0.01" value="${Number(product.price||0)}" required></div>
  <div id="editDecantPrices" class="decant-price-fields" hidden><div><label for="editDecantPrice5">Preço do frasco de 5 ml</label><input id="editDecantPrice5" type="number" min="0.01" step="0.01" value="${Number(product.decantPrices?.["5"]||0)||""}"></div><div><label for="editDecantPrice10">Preço do frasco de 10 ml</label><input id="editDecantPrice10" type="number" min="0.01" step="0.01" value="${Number(product.decantPrices?.["10"]||0)||""}"></div><small>Os preços serão selecionados pelo cliente na loja.</small></div>
  <div><label for="editOriginalPrice">Preço original</label><input id="editOriginalPrice" type="number" min="0" step="0.01" value="${Number(product.originalPrice||0)}"></div>
  <div><label for="editStock">Estoque</label><input id="editStock" type="number" min="0" step="1" value="${Number(product.stock||0)}"></div>
  <div class="edit-product-wide"><label for="editDesc">Descrição</label><textarea id="editDesc" rows="4">${esc(product.desc||"")}</textarea></div>
  <div class="edit-checks edit-product-wide"><label><input id="editIsLaunch" type="checkbox" ${product.isLaunch?"checked":""}> Lançamento</label><label><input id="editIsFeatured" type="checkbox" ${product.isFeatured?"checked":""}> Destaque</label></div>
  <div class="edit-product-wide">
   <strong>Fotos do produto</strong>
   <p class="edit-photo-help">Escolha uma nova imagem para substituir uma foto. As alterações só serão gravadas quando clicar em “Salvar alterações”.</p>
   <div class="edit-photo-slots">
    ${[0,1,2].map(i=>`<div class="edit-photo-slot">
      <div class="edit-photo-preview" id="editPhotoPreview${i+1}">${editSelectedImages[i]?`<img src="${esc(editSelectedImages[i])}" alt="Foto ${i+1} do produto">`:`Foto ${i+1}`}</div>
      <input type="file" accept="image/*" id="editImage${i+1}" hidden>
      <div class="edit-photo-actions">
       <button type="button" class="btn-outline small" data-edit-choose="${i+1}">${editSelectedImages[i]?"Substituir foto":"Adicionar foto"}</button>
       <button type="button" class="remove-photo-btn" data-edit-remove="${i+1}" ${editSelectedImages[i]?"":"hidden"}>Remover</button>
      </div>
     </div>`).join("")}
   </div>
  </div>
 </div>`;

 document.getElementById("editCat").value=product.category||"";
 document.getElementById("editGender").value=product.gender||"unissex";
 const toggleEditDecantFields=()=>{const decant=document.getElementById("editCat").value==="decants";document.getElementById("editDecantPrices").hidden=!decant;document.getElementById("editStandardPriceField").hidden=decant;document.getElementById("editOriginalPrice").closest("div").hidden=decant;document.getElementById("editPrice").required=!decant;document.getElementById("editDecantPrice5").required=decant;document.getElementById("editDecantPrice10").required=decant;};
 document.getElementById("editCat").addEventListener("change",toggleEditDecantFields);
 toggleEditDecantFields();
 modal.dataset.productId=product.id;
 modal.hidden=false;
 document.body.classList.add("modal-open");

 for(let i=0;i<3;i++){
  const slot=i+1;
  body.querySelector(`[data-edit-choose="${slot}"]`)?.addEventListener("click",()=>body.querySelector(`#editImage${slot}`)?.click());
  body.querySelector(`[data-edit-remove="${slot}"]`)?.addEventListener("click",()=>{
   editSelectedImages[i]="";
   const input=body.querySelector(`#editImage${slot}`);
   if(input)input.value="";
   renderEditPhotoSlot(i);
  });
  body.querySelector(`#editImage${slot}`)?.addEventListener("change",async e=>{
   const file=e.target.files?.[0];
   if(!file)return;
   try{
    editSelectedImages[i]=await compress(file);
    renderEditPhotoSlot(i);
   }catch(error){
    e.target.value="";
    alert(error.message||"Não foi possível carregar a imagem.");
   }
  });
 }
}

function renderEditPhotoSlot(index){
 const preview=document.getElementById(`editPhotoPreview${index+1}`);
 const choose=document.querySelector(`[data-edit-choose="${index+1}"]`);
 const remove=document.querySelector(`[data-edit-remove="${index+1}"]`);
 if(!preview)return;
 if(editSelectedImages[index]){
  preview.innerHTML=`<img src="${esc(editSelectedImages[index])}" alt="Prévia da foto ${index+1}">`;
  if(choose)choose.textContent="Substituir foto";
  if(remove)remove.hidden=false;
 }else{
  preview.textContent=`Foto ${index+1}`;
  if(choose)choose.textContent="Adicionar foto";
  if(remove)remove.hidden=true;
 }
}
function closeProductEdit(){
 const modal=document.getElementById("productEditModal");
 if(modal)modal.hidden=true;
 document.body.classList.remove("modal-open");
}

async function saveProductEdit(){
 const modal=document.getElementById("productEditModal");
 const id=modal?.dataset.productId;
 const original=productsCache.find(p=>String(p.id)===String(id));
 if(!original)return;
 const isDecant=document.getElementById("editCat")?.value==="decants";
 const decantPrice5=Number(document.getElementById("editDecantPrice5")?.value);
 const decantPrice10=Number(document.getElementById("editDecantPrice10")?.value);
 const price=isDecant?decantPrice5:Number(document.getElementById("editPrice")?.value);
 const originalPrice=isDecant?0:Number(document.getElementById("editOriginalPrice")?.value||0);
 const payload={
  ...original,
  name:document.getElementById("editName")?.value.trim(),brand:document.getElementById("editBrand")?.value.trim(),
  category:document.getElementById("editCat")?.value,gender:document.getElementById("editGender")?.value,
  volume:isDecant?5:Number(document.getElementById("editVolume")?.value||0),price,originalPrice,
  ...(isDecant?{decantPrices:{"5":decantPrice5,"10":decantPrice10}}:{decantPrices:null}),
  stock:Number(document.getElementById("editStock")?.value||0),desc:document.getElementById("editDesc")?.value.trim(),
  isLaunch:document.getElementById("editIsLaunch")?.checked,isFeatured:document.getElementById("editIsFeatured")?.checked,
  images:editSelectedImages.filter(Boolean),image:editSelectedImages.find(Boolean)||""
 };
 if(!payload.name||!Number.isFinite(price)||price<0){alert("Preencha nome e preço corretamente.");return;}
 if(isDecant&&(!Number.isFinite(decantPrice5)||decantPrice5<=0||!Number.isFinite(decantPrice10)||decantPrice10<=0)){alert("Informe preços válidos para os decants de 5 ml e 10 ml.");return;}
 if(originalPrice>0&&originalPrice<price){alert("O preço original deve ser maior ou igual ao preço de venda.");return;}
 const button=document.getElementById("saveProductEditBtn");
 if(button)button.disabled=true;
 try{
  await api(`/api/admin/products/${encodeURIComponent(id)}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
  closeProductEdit();editSelectedImages=["","",""];showProductMessage("Produto atualizado com sucesso.");await loadProducts();
 }catch(error){alert(error.message)}finally{if(button)button.disabled=false}
}

async function loadProducts(){
 try{
  const data=await api("/api/admin/products");
  productsCache=data.products||[];
  applyProductsSearch();
  productsPage=1;
  catalogStatus.textContent=`${productsCache.length} produto(s) no catálogo do servidor.`;
  renderProductsPage();
 }catch(e){catalogStatus.textContent=e.message}
}

function compress(file){
 return new Promise((resolve,reject)=>{
  if(!file){resolve("");return}
  if(!file.type.startsWith("image/")){reject(new Error("Escolha um arquivo de imagem."));return}
  const r=new FileReader();
  r.onerror=()=>reject(new Error("Não foi possível ler a imagem."));
  r.onload=()=>{
   const img=new Image();
   img.onerror=()=>reject(new Error("Não foi possível processar a imagem."));
   img.onload=()=>{
    const max=900,scale=Math.min(1,max/Math.max(img.width,img.height));
    const c=document.createElement("canvas");c.width=Math.max(1,Math.round(img.width*scale));c.height=Math.max(1,Math.round(img.height*scale));
    c.getContext("2d").drawImage(img,0,0,c.width,c.height);
    resolve(c.toDataURL("image/jpeg",.82));
   };
   img.src=r.result;
  };
  r.readAsDataURL(file);
 })
}

function renderPhotoSlot(index){
 const preview=document.getElementById(`photoPreview${index+1}`);
 const remove=document.getElementById(`removeImageBtn${index+1}`);
 if(!preview)return;
 if(selectedImages[index]){
  preview.innerHTML=`<img src="${esc(selectedImages[index])}" alt="Prévia da foto ${index+1}">`;
  if(remove)remove.hidden=false;
 }else{
  preview.textContent=`Foto ${index+1}`;
  if(remove)remove.hidden=true;
 }
}

for(let i=0;i<3;i++){
 document.getElementById(`chooseImageBtn${i+1}`)?.addEventListener("click",()=>document.getElementById(`newImage${i+1}`)?.click());
 document.getElementById(`removeImageBtn${i+1}`)?.addEventListener("click",()=>{selectedImages[i]="";const input=document.getElementById(`newImage${i+1}`);if(input)input.value="";renderPhotoSlot(i)});
 document.getElementById(`newImage${i+1}`)?.addEventListener("change",async e=>{
  try{selectedImages[i]=await compress(e.target.files?.[0]);renderPhotoSlot(i)}
  catch(err){selectedImages[i]="";e.target.value="";renderPhotoSlot(i);showProductMessage(err.message)}
 });
}

productForm?.addEventListener("submit",async e=>{
 e.preventDefault();showProductMessage("Cadastrando...");
 const category=document.getElementById("newCat").value;
 const isDecant=category==="decants";
 const decantPrice5=Number(document.getElementById("newDecantPrice5")?.value);
 const decantPrice10=Number(document.getElementById("newDecantPrice10")?.value);
 const price=isDecant?decantPrice5:Number(document.getElementById("newPrice").value);
 const originalPrice=isDecant?0:Number(document.getElementById("newOriginalPrice").value||0);
 if(isDecant&&(!Number.isFinite(decantPrice5)||decantPrice5<=0||!Number.isFinite(decantPrice10)||decantPrice10<=0)){showProductMessage("Informe preços válidos para os decants de 5 ml e 10 ml.");return}
 if(originalPrice>0&&originalPrice<price){showProductMessage("O preço original deve ser maior ou igual ao preço de venda.");return}
 const product={
  name:document.getElementById("newName").value.trim(),brand:document.getElementById("newBrand").value.trim(),
  category,gender:document.getElementById("newGender").value,
  volume:isDecant?5:Number(document.getElementById("newVolume").value||0),price,originalPrice,
  ...(isDecant?{decantPrices:{"5":decantPrice5,"10":decantPrice10}}:{}),
  stock:Number(document.getElementById("newStock").value||0),desc:document.getElementById("newDesc").value.trim(),
  isLaunch:document.getElementById("newIsLaunch").checked,isFeatured:document.getElementById("newIsFeatured").checked,images:selectedImages.filter(Boolean),image:selectedImages.find(Boolean)||""
 };
 try{
  await api("/api/admin/products",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(product)});
  productForm.reset();document.getElementById("newStock").value="1";document.getElementById("newIsLaunch").checked=true;toggleNewDecantFields();
  selectedImages=["","",""];for(let i=0;i<3;i++){const input=document.getElementById(`newImage${i+1}`);if(input)input.value="";renderPhotoSlot(i);}
  showProductMessage("Produto cadastrado com sucesso.");await loadProducts();
 }catch(err){showProductMessage(err.message)}
});

function toggleNewDecantFields(){
 const isDecant=document.getElementById("newCat")?.value==="decants";
 const decantFields=document.getElementById("newDecantPrices");
 const standardPrice=document.getElementById("newStandardPriceField");
 const originalPrice=document.getElementById("newOriginalPrice")?.closest("div");
 if(decantFields)decantFields.hidden=!isDecant;
 if(standardPrice)standardPrice.hidden=isDecant;
 if(originalPrice)originalPrice.hidden=isDecant;
 const p5=document.getElementById("newDecantPrice5");const p10=document.getElementById("newDecantPrice10");
 if(p5)p5.required=isDecant;if(p10)p10.required=isDecant;
 const standardInput=document.getElementById("newPrice");if(standardInput)standardInput.required=!isDecant;
}
document.getElementById("newCat")?.addEventListener("change",toggleNewDecantFields);
toggleNewDecantFields();

document.getElementById("refreshProductsBtn")?.addEventListener("click",loadProducts);

async function checkSession(){
 try{const data=await api("/api/admin/me");if(data.authenticated){showDashboard();await loadProducts();await loadBanners();await loadOlfactoryFamilies();await loadOrders();await loadCustomers()}else showLogin()}
 catch{showLogin()}
}

loginForm?.addEventListener("submit",async e=>{
 e.preventDefault();const email=document.getElementById("adminEmail").value.trim(),password=document.getElementById("adminPassword").value;
 if(!email||!password){showMessage("Preencha e-mail e senha.");return}
 showMessage("Entrando...");
 try{
  const response=await fetch("/api/admin/login",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){showMessage(data.error||"Não foi possível entrar na área administrativa.");return}
  document.getElementById("adminPassword").value="";showMessage("");showDashboard();await loadProducts();await loadBanners();await loadOlfactoryFamilies();await loadOrders();await loadCustomers();
 }catch{showMessage("Não foi possível conectar ao servidor. Verifique se o server.js está rodando.")}
});

logoutBtn?.addEventListener("click",async()=>{try{await fetch("/api/admin/logout",{method:"POST",credentials:"same-origin"})}finally{showLogin()}});
checkSession();


const bannerMessage = document.getElementById("bannerMessage");
const bannersAdminGrid = document.getElementById("bannersAdminGrid");
const refreshBannersBtn = document.getElementById("refreshBannersBtn");

const BANNER_CATEGORIES = [
 {id:"brand-masc",label:"Brand Collection Masc."},
 {id:"brand-fem",label:"Brand Collection Fem."},
 {id:"arabe-masc",label:"Perfumes Árabes Masc."},
 {id:"arabe-fem",label:"Perfumes Árabes Fem."},
 {id:"compartilhaveis",label:"Compartilháveis"},
 {id:"infantil",label:"Infantil"},
 {id:"body-splash",label:"Body Splash"},
 {id:"arabic-collection",label:"Arabic Collection"},
 {id:"kits",label:"Kits"},
 {id:"outlet",label:"Outlet"},
 {id:"decants",label:"Decants"}
];

function showBannerMessage(text, error=false){
 if(!bannerMessage)return;
 bannerMessage.textContent=text||"";
 bannerMessage.style.color=error?"var(--danger)":"var(--gray)";
}

function bannerOptions(selected){
 return `<option value="">Sem destino / não clicável</option>`+
  BANNER_CATEGORIES.map(c=>`<option value="${esc(c.id)}" ${c.id===selected?"selected":""}>${esc(c.label)}</option>`).join("");
}

function bannerImageSrc(image){
 const value=String(image||"").trim();
 if(!value)return "";
 if(/^data:image\//i.test(value))return value;
 if(/^https?:\/\//i.test(value))return value;
 return "/"+value.replace(/^\.\//,"").replace(/^\//,"");
}

function renderBanners(banners){
 if(!bannersAdminGrid)return;
 bannersAdminGrid.innerHTML=(banners||[]).map((banner,index)=>`\
  <article class="banner-admin-card" data-banner-card="${index}">\
   <div class="banner-admin-preview"><img src="${esc(bannerImageSrc(banner.image))}" alt="Prévia do banner ${index+1}" data-banner-preview="${index}"></div>\
   <div class="banner-admin-info">\
    <strong>Banner ${index+1}</strong>\
    <label for="bannerCategory${index}">Categoria de destino</label>\
    <select id="bannerCategory${index}" data-banner-category="${index}">${bannerOptions(banner.category)}</select>\
    <input type="file" accept="image/*" hidden data-banner-file="${index}">\
    <div class="banner-admin-actions">\
      <button type="button" class="btn-outline" data-banner-choose="${index}">Trocar imagem</button>\
      <button type="button" class="btn-primary small" data-banner-save="${index}">Salvar</button>\
    </div>\
    <small data-banner-destination="${index}">${banner.category?`Destino: ${esc((BANNER_CATEGORIES.find(c=>c.id===banner.category)||{}).label||banner.category)}`:"Sem destino"}</small>\
   </div>\
  </article>`).join("");

 bannersAdminGrid.querySelectorAll("[data-banner-choose]").forEach(btn=>btn.addEventListener("click",()=>{
  document.querySelector(`[data-banner-file="${btn.dataset.bannerChoose}"]`)?.click();
 }));
 bannersAdminGrid.querySelectorAll("[data-banner-category]").forEach(select=>select.addEventListener("change",()=>{
  const label=(BANNER_CATEGORIES.find(c=>c.id===select.value)||{}).label||select.value;
  const dest=bannersAdminGrid.querySelector(`[data-banner-destination="${select.dataset.bannerCategory}"]`);
  if(dest)dest.textContent=select.value?`Destino: ${label}`:"Sem destino";
 }));
 bannersAdminGrid.querySelectorAll("[data-banner-file]").forEach(input=>input.addEventListener("change",async()=>{
  const file=input.files?.[0]; if(!file)return;
  try{
   const data=await compressBanner(file);
   const preview=bannersAdminGrid.querySelector(`[data-banner-preview="${input.dataset.bannerFile}"]`);
   if(preview)preview.src=data;
   input.closest(".banner-admin-card").dataset.pendingImage=data;
   showBannerMessage("Prévia atualizada. Clique em Salvar.");
  }catch(e){input.value="";showBannerMessage(e.message,true)}
 }));
 bannersAdminGrid.querySelectorAll("[data-banner-save]").forEach(btn=>btn.addEventListener("click",async()=>{
  const index=Number(btn.dataset.bannerSave), card=btn.closest(".banner-admin-card");
  const select=card.querySelector(`[data-banner-category="${index}"]`);
  const image=card.dataset.pendingImage;
  const payload={category:select?.value||""};
  if(image)payload.image=image;
  btn.disabled=true;showBannerMessage(`Salvando banner ${index+1}...`);
  try{
   const data=await api(`/api/admin/banners/${index}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
   card.dataset.pendingImage="";
   localStorage.removeItem("dropsLuxoBanners");
   const preview=card.querySelector(`[data-banner-preview="${index}"]`); if(preview&&data.banner?.image)preview.src=bannerImageSrc(data.banner.image);
   showBannerMessage(`Banner ${index+1} salvo com sucesso.`);
  }catch(e){showBannerMessage(e.message,true)}finally{btn.disabled=false}
 }));
}

function compressBanner(file){
 return new Promise((resolve,reject)=>{
  if(!file.type.startsWith("image/")){reject(new Error("Escolha um arquivo de imagem."));return}
  const reader=new FileReader();
  reader.onerror=()=>reject(new Error("Não foi possível ler a imagem."));
  reader.onload=()=>{
   const img=new Image(); img.onerror=()=>reject(new Error("Não foi possível processar a imagem."));
   img.onload=()=>{
    const maxWidth=1800,maxHeight=900,scale=Math.min(1,maxWidth/img.naturalWidth,maxHeight/img.naturalHeight);
    const canvas=document.createElement("canvas"); canvas.width=Math.max(1,Math.round(img.naturalWidth*scale)); canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
    canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);
    resolve(canvas.toDataURL("image/jpeg",.82));
   }; img.src=reader.result;
  }; reader.readAsDataURL(file);
 });
}

async function loadBanners(){
 try{
  const data=await api("/api/banners");
  renderBanners(data.banners||[]);
 }catch(e){showBannerMessage(e.message,true)}
}

refreshBannersBtn?.addEventListener("click",loadBanners);


/* =========================================================
   FAMÍLIAS OLFATIVAS
   ========================================================= */
const familyForm=document.getElementById("olfactoryFamilyForm");
const familyName=document.getElementById("olfactoryFamilyName");
const familyOrder=document.getElementById("olfactoryFamilyOrder");
const familyDescription=document.getElementById("olfactoryFamilyDescription");
const familyImageInput=document.getElementById("olfactoryFamilyImage");
const familyImagePreview=document.getElementById("olfactoryFamilyImagePreview");
const familyActive=document.getElementById("olfactoryFamilyActive");
const familyMessage=document.getElementById("olfactoryFamilyMessage");
const familyList=document.getElementById("olfactoryFamiliesList");
const familyIdInput=document.getElementById("olfactoryFamilyId");
const refreshFamiliesBtn=document.getElementById("refreshOlfactoryFamiliesBtn");
const cancelFamilyBtn=document.getElementById("cancelOlfactoryFamilyBtn");
const familyAssignmentSearch=document.getElementById("familyAssignmentSearch");
const familyAssignmentProduct=document.getElementById("familyAssignmentProduct");
const familyAssignmentFamily=document.getElementById("familyAssignmentFamily");
const familyAssignmentMessage=document.getElementById("familyAssignmentMessage");
const saveFamilyAssignmentBtn=document.getElementById("saveFamilyAssignmentBtn");
let familyImageData="", familyProductsCache=[], familiesCache=[];
function familyMsg(message,error=false){if(familyMessage){familyMessage.textContent=message;familyMessage.classList.toggle("error",error)}}
function assignmentMsg(message,error=false){if(familyAssignmentMessage){familyAssignmentMessage.textContent=message;familyAssignmentMessage.classList.toggle("error",error)}}
function ensureFamilyAssignmentDatalist(){
 if(!familyAssignmentSearch)return null;
 let list=document.getElementById("familyAssignmentProductSuggestions");
 if(!list){
  list=document.createElement("datalist");
  list.id="familyAssignmentProductSuggestions";
  document.body.appendChild(list);
 }
 familyAssignmentSearch.setAttribute("list",list.id);
 familyAssignmentSearch.setAttribute("autocomplete","off");
 return list;
}
function hideFamilyAssignmentProductSelect(){
 if(!familyAssignmentProduct)return;
 // Remove o campo intermediário "Produto do catálogo", mantendo o input pesquisável.
 const field=familyAssignmentProduct.closest(".form-group, .form-field, .field, .admin-field") || familyAssignmentProduct.parentElement;
 if(field)field.hidden=true;
}
function getFamilyAssignmentProductFromSearch(){
 const typed=String(familyAssignmentSearch?.value||"").trim().toLocaleLowerCase("pt-BR");
 if(!typed)return null;
 return familyProductsCache.find(p=>{
  const name=String(p.name||"").trim().toLocaleLowerCase("pt-BR");
  const label=`${String(p.name||"Produto sem nome")}${p.brand?` — ${p.brand}`:""}`.trim().toLocaleLowerCase("pt-BR");
  return typed===name || typed===label;
 }) || null;
}
function renderAssignmentProducts(){
 hideFamilyAssignmentProductSelect();
 if(!familyAssignmentSearch)return;
 const query=String(familyAssignmentSearch.value||"").trim().toLocaleLowerCase("pt-BR");
 const filtered=familyProductsCache.filter(p=>`${p.name||""} ${p.brand||""}`.toLocaleLowerCase("pt-BR").includes(query));
 const list=ensureFamilyAssignmentDatalist();
 if(list){
  list.innerHTML=filtered.slice(0,50).map(p=>{
   const label=`${p.name||"Produto sem nome"}${p.brand?` — ${p.brand}`:""}`;
   return `<option value="${esc(label)}"></option>`;
  }).join("");
 }
}
function renderAssignmentFamilies(){
 if(!familyAssignmentFamily)return;
 const current=familyAssignmentFamily.value;
 familyAssignmentFamily.innerHTML='<option value="">Selecione uma família</option>'+familiesCache.filter(f=>f.active!==false).slice().sort((a,b)=>String(a.name).localeCompare(String(b.name),"pt-BR")).map(f=>`<option value="${esc(f.id)}">${esc(f.name)}</option>`).join("");
 if(familiesCache.some(f=>String(f.id)===current&&f.active!==false))familyAssignmentFamily.value=current;
}
function resetFamilyForm(){familyForm?.reset();familyIdInput.value="";familyOrder.value="0";familyActive.checked=true;familyImageData="";familyImageInput.value="";familyImagePreview.innerHTML="";cancelFamilyBtn.hidden=true;document.getElementById("saveOlfactoryFamilyBtn").textContent="Salvar família";familyMsg("")}
function renderFamilies(){
 if(!familyList)return;
 if(!familiesCache.length){familyList.innerHTML='<p>Nenhuma família olfativa cadastrada ainda.</p>';return}
 familyList.innerHTML=`<table class="admin-table"><thead><tr><th>Família</th><th>Produtos associados</th><th>Status</th><th>Ações</th></tr></thead><tbody>${familiesCache.slice().sort((a,b)=>(Number(a.order)||0)-(Number(b.order)||0)||String(a.name).localeCompare(String(b.name),"pt-BR")).map(f=>`<tr><td><strong>${esc(f.name)}</strong><br><small>${esc(f.description||"")}</small></td><td>${(f.productIds||[]).length}</td><td>${f.active===false?'Inativa':'Ativa'}</td><td><button type="button" class="btn-outline small" data-family-edit="${esc(f.id)}">Editar</button> <button type="button" class="btn-outline small" data-family-delete="${esc(f.id)}">Excluir</button></td></tr>`).join("")}</tbody></table>`;
 familyList.querySelectorAll('[data-family-edit]').forEach(b=>b.addEventListener('click',()=>{const f=familiesCache.find(x=>String(x.id)===b.dataset.familyEdit);if(!f)return;familyIdInput.value=f.id;familyName.value=f.name||"";familyOrder.value=Number(f.order)||0;familyDescription.value=f.description||"";familyActive.checked=f.active!==false;familyImageData=f.image||"";familyImageInput.value="";familyImagePreview.innerHTML=familyImageData?`<img src="${esc(familyImageData)}" alt="Prévia da família" style="max-width:180px;max-height:120px">`:"";cancelFamilyBtn.hidden=false;document.getElementById('saveOlfactoryFamilyBtn').textContent='Salvar alterações';familyMsg('Editando família: '+f.name);familyForm.scrollIntoView({behavior:'smooth',block:'start'})}));
 familyList.querySelectorAll('[data-family-delete]').forEach(b=>b.addEventListener('click',async()=>{const f=familiesCache.find(x=>String(x.id)===b.dataset.familyDelete);if(!f||!confirm(`Excluir a família “${f.name}”?`))return;try{await api('/api/admin/olfactory-families/'+encodeURIComponent(f.id),{method:'DELETE'});familyMsg('Família excluída.');await loadOlfactoryFamilies()}catch(e){familyMsg(e.message,true)}}));
}
async function loadOlfactoryFamilies(){if(familyList)familyList.innerHTML='<p>Carregando famílias olfativas…</p>';try{const data=await api('/api/admin/olfactory-families');familiesCache=Array.isArray(data.families)?data.families:[];familyProductsCache=Array.isArray(data.products)?data.products:[];renderFamilies();renderAssignmentProducts();renderAssignmentFamilies()}catch(e){familyMsg(e.message,true);if(familyList)familyList.innerHTML='<p>Não foi possível carregar as famílias.</p>'}}
familyAssignmentSearch?.addEventListener("input",renderAssignmentProducts);
familyAssignmentSearch?.addEventListener("change",renderAssignmentProducts);
familyImageInput?.addEventListener('change',async()=>{const file=familyImageInput.files?.[0];if(!file)return;try{familyMsg('Processando imagem…');familyImageData=await compressBanner(file);familyImagePreview.innerHTML=`<img src="${familyImageData}" alt="Prévia da família" style="max-width:180px;max-height:120px">`;familyMsg('Imagem pronta. Clique em Salvar família.')}catch(e){familyMsg(e.message,true)}});
familyForm?.addEventListener('submit',async event=>{event.preventDefault();const name=familyName.value.trim();if(name.length<2){familyMsg('Informe um nome com pelo menos 2 caracteres.',true);return}const button=document.getElementById('saveOlfactoryFamilyBtn');button.disabled=true;familyMsg('Salvando família…');const payload={name,description:familyDescription.value.trim(),image:familyImageData,order:Number(familyOrder.value)||0,active:familyActive.checked};const id=familyIdInput.value;try{await api(id?'/api/admin/olfactory-families/'+encodeURIComponent(id):'/api/admin/olfactory-families',{method:id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});resetFamilyForm();familyMsg('Família salva com sucesso.');await loadOlfactoryFamilies()}catch(e){familyMsg(e.message,true)}finally{button.disabled=false}});
saveFamilyAssignmentBtn?.addEventListener('click',async()=>{
 const selectedProduct=getFamilyAssignmentProductFromSearch();const productId=selectedProduct?.id;const familyId=familyAssignmentFamily?.value;
 if(!productId||!familyId){assignmentMsg('Digite e selecione uma sugestão válida de produto e escolha uma família olfativa.',true);return}
 saveFamilyAssignmentBtn.disabled=true;assignmentMsg('Salvando associação…');
 try{await api('/api/admin/olfactory-assignment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({productId,familyId})});assignmentMsg('Associação salva com sucesso.');await loadOlfactoryFamilies()}
 catch(e){assignmentMsg(e.message,true)}finally{saveFamilyAssignmentBtn.disabled=false}
});
refreshFamiliesBtn?.addEventListener('click',loadOlfactoryFamilies);cancelFamilyBtn?.addEventListener('click',resetFamilyForm);

/* =========================================================
   CLIENTES — FASE 3
   ========================================================= */

const customersSearch = document.getElementById("customersSearch");
const refreshCustomersBtn = document.getElementById("refreshCustomersBtn");
const customersPagination = document.getElementById("customersPagination");
const customersMessage = document.getElementById("customersMessage");
const customersStatus = document.getElementById("customersStatus");
const customersBody = document.getElementById("customersBody");
const customerModal = document.getElementById("customerModal");
const customerModalBody = document.getElementById("customerModalBody");
const customerModalTitle = document.getElementById("customerModalTitle");
const closeCustomerModalBtn = document.getElementById("closeCustomerModalBtn");
const cancelCustomerModalBtn = document.getElementById("cancelCustomerModalBtn");
let customersCache=[];
let customersPage=1;
const CUSTOMERS_PER_PAGE=8;

function showCustomersMessage(text,error=false){
 if(!customersMessage)return;
 customersMessage.textContent=text||"";
 customersMessage.style.color=error?"var(--danger)":"var(--gray)";
}

function customerDate(value){
 if(!value)return "—";
 const date=new Date(value);
 return Number.isNaN(date.getTime())?"—":date.toLocaleDateString("pt-BR");
}

function customerPhone(value){
 const digits=String(value||"").replace(/\D/g,"");
 if(digits.length===11)return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`;
 if(digits.length===10)return `(${digits.slice(0,2)}) ${digits.slice(2,6)}-${digits.slice(6)}`;
 return value||"—";
}

function renderCustomersPagination(total){
 if(!customersPagination)return;
 const pages=Math.max(1,Math.ceil(total/CUSTOMERS_PER_PAGE));
 customersPage=Math.min(customersPage,pages);
 if(pages<=1){customersPagination.innerHTML="";return;}
 customersPagination.innerHTML=`<button type="button" class="pagination-btn" data-customers-page="prev" ${customersPage===1?"disabled":""}>Anterior</button>
  <span class="pagination-info">Página ${customersPage} de ${pages}</span>
  <button type="button" class="pagination-btn" data-customers-page="next" ${customersPage===pages?"disabled":""}>Próxima</button>`;
 customersPagination.querySelector('[data-customers-page="prev"]')?.addEventListener("click",()=>{customersPage--;renderCustomers()});
 customersPagination.querySelector('[data-customers-page="next"]')?.addEventListener("click",()=>{customersPage++;renderCustomers()});
}

function renderCustomers(){
 if(!customersBody)return;
 const pages=Math.max(1,Math.ceil(customersCache.length/CUSTOMERS_PER_PAGE));
 customersPage=Math.min(customersPage,pages);
 const start=(customersPage-1)*CUSTOMERS_PER_PAGE;
 const list=customersCache.slice(start,start+CUSTOMERS_PER_PAGE);
 if(customersStatus)customersStatus.textContent=`${customersCache.length} cliente(s) cadastrado(s).`;
 if(!list.length){
  customersBody.innerHTML='<tr><td colspan="6" class="empty-table">Nenhum cliente encontrado.</td></tr>';
  renderCustomersPagination(0);return;
 }
 customersBody.innerHTML=list.map(customer=>`<tr>
  <td><strong>${esc(customer.name||"—")}</strong></td>
  <td>${esc(customer.email||"—")}</td>
  <td>${esc(customerPhone(customer.phone))}</td>
  <td>${esc(customerDate(customer.createdAt))}</td>
  <td>${Number(customer.orderCount||0)}</td>
  <td><button type="button" class="btn-outline table-action" data-customer-view="${esc(customer.id)}">Ver detalhes</button></td>
 </tr>`).join("");
 customersBody.querySelectorAll("[data-customer-view]").forEach(btn=>btn.addEventListener("click",()=>openCustomerModal(btn.dataset.customerView)));
 renderCustomersPagination(customersCache.length);
}

function renderCustomerAddress(address){
 if(!address)return '<p class="detail-muted">Nenhum endereço cadastrado.</p>';
 return `<div class="customer-address-box">
  <strong>${esc(address.street||"—")}, ${esc(address.number||"S/N")}</strong>
  ${address.complement?`<span>${esc(address.complement)}</span>`:""}
  <span>${esc(address.neighborhood||"—")} · ${esc(address.city||"—")}/${esc(address.state||"—")}</span>
  <span>CEP ${esc(address.cep||"—")}</span>
 </div>`;
}

function openCustomerModal(id){
 const customer=customersCache.find(item=>item.id===id);
 if(!customer||!customerModal||!customerModalBody)return;
 if(customerModalTitle)customerModalTitle.textContent=customer.name||"Cliente";
 const orderRows=(customer.orders||[]).map(order=>`<div class="customer-order-row"><strong>${esc(order.order_nsu||"—")}</strong><span>${esc(orderStatusLabel(order.status))}</span><span>${orderMoney(order.amount)}</span><span>${esc(orderDate(order.createdAt))}</span></div>`).join("");
 customerModalBody.innerHTML=`
  <div class="customer-detail-grid">
   <div><span>E-mail</span><strong>${esc(customer.email||"—")}</strong></div>
   <div><span>Telefone</span><strong>${esc(customerPhone(customer.phone))}</strong></div>
   <div><span>CPF/CNPJ</span><strong>${esc(customer.document||"Não informado")}</strong></div>
   <div><span>Cadastro</span><strong>${esc(customerDate(customer.createdAt))}</strong></div>
  </div>
  <div class="customer-detail-section"><h4>Endereço</h4>${renderCustomerAddress(customer.address)}</div>
  <div class="customer-detail-section"><h4>Histórico de pedidos (${Number(customer.orderCount||0)})</h4>${orderRows||'<p class="detail-muted">Nenhum pedido encontrado.</p>'}</div>`;
 customerModal.hidden=false;
 document.body.classList.add("modal-open");
}

function closeCustomerModal(){
 if(!customerModal)return;
 customerModal.hidden=true;
 document.body.classList.remove("modal-open");
}

async function loadCustomers(){
 if(!customersBody)return;
 try{
  showCustomersMessage("Carregando clientes...");
  const q=customersSearch?.value.trim()||"";
  const data=await api(`/api/admin/customers${q?`?q=${encodeURIComponent(q)}`:""}`);
  customersCache=data.customers||[];
  customersPage=1;
  renderCustomers();
  showCustomersMessage("");
 }catch(error){
  showCustomersMessage(error.message,true);
  if(customersBody)customersBody.innerHTML='<tr><td colspan="6" class="empty-table">Não foi possível carregar os clientes.</td></tr>';
 }
}

refreshCustomersBtn?.addEventListener("click",loadCustomers);
let customersSearchTimer=null;
customersSearch?.addEventListener("input",()=>{
 clearTimeout(customersSearchTimer);
 customersSearchTimer=setTimeout(loadCustomers,300);
});
closeCustomerModalBtn?.addEventListener("click",closeCustomerModal);
cancelCustomerModalBtn?.addEventListener("click",closeCustomerModal);
customerModal?.querySelector("[data-customer-close]")?.addEventListener("click",closeCustomerModal);


document.querySelectorAll("[data-sales-view]").forEach(button=>button.addEventListener("click",()=>{
 const view=button.dataset.salesView;
 document.querySelectorAll("[data-sales-view]").forEach(tab=>tab.classList.toggle("is-active",tab===button));
 const ordersView=document.getElementById("salesOrdersView");
 const customersView=document.getElementById("salesCustomersView");
 if(ordersView)ordersView.hidden=view!=="orders";
 if(customersView)customersView.hidden=view!=="customers";
 if(view==="customers")loadCustomers();
}));

/* =========================================================
   PEDIDOS — FASE 2
   ========================================================= */

const refreshOrdersBtn = document.getElementById("refreshOrdersBtn");
const ordersSearch = document.getElementById("ordersSearch");
const ordersStatusFilter = document.getElementById("ordersStatusFilter");
const ordersPeriodFilter = document.getElementById("ordersPeriodFilter");
const ordersPagination = document.getElementById("ordersPagination");
let ordersCache=[];
let ordersPage=1;
const ORDERS_PER_PAGE=8;
const ordersMessage = document.getElementById("ordersMessage");
const ordersStatus = document.getElementById("ordersStatus");
const ordersBody = document.getElementById("ordersBody");
const orderModal = document.getElementById("orderModal");
const orderModalBody = document.getElementById("orderModalBody");
const orderModalTitle = document.getElementById("orderModalTitle");
const orderModalMessage = document.getElementById("orderModalMessage");
const closeOrderModalBtn = document.getElementById("closeOrderModalBtn");
const cancelOrderModalBtn = document.getElementById("cancelOrderModalBtn");
const saveOrderStatusBtn = document.getElementById("saveOrderStatusBtn");

const ORDER_STATUS_LABELS = {
 "aguardando_pagamento":"Aguardando pagamento",
 "pago":"Pago",
 "pedido_confirmado":"Pedido confirmado",
 "em_preparacao":"Em preparação",
 "enviado":"Enviado",
 "entregue":"Entregue",
 "cancelado":"Cancelado"
};

const DELIVERY_LABELS = {
 retirada:"Retirada",
 correios:"Correios"
};

let currentOrder = null;

function showOrdersMessage(text, error=false){
 if(!ordersMessage)return;
 ordersMessage.textContent=text||"";
 ordersMessage.style.color=error?"var(--danger)":"var(--gray)";
}

function showOrderModalMessage(text, error=false){
 if(!orderModalMessage)return;
 orderModalMessage.textContent=text||"";
 orderModalMessage.style.color=error?"var(--danger)":"var(--gray)";
}

function orderStatusLabel(status){
 return ORDER_STATUS_LABELS[String(status||"").toLowerCase()] || String(status||"—");
}

function deliveryLabel(delivery){
 return DELIVERY_LABELS[String(delivery||"").toLowerCase()] || String(delivery||"—");
}

function freightLabel(order){
 const code=String(order?.freight?.service||"");
 if(code==="1")return "PAC";
 if(code==="2")return "SEDEX";
 return order?.delivery==="retirada" ? "Retirada" : "—";
}

function orderMoney(cents){
 return money((Number(cents)||0)/100);
}

function orderDate(value){
 if(!value)return "—";
 const date=new Date(value);
 if(Number.isNaN(date.getTime()))return "—";
 return date.toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"});
}

function renderOrderStatusOptions(selected){
 return Object.entries(ORDER_STATUS_LABELS).map(([value,label])=>
  `<option value="${esc(value)}" ${value===selected?"selected":""}>${esc(label)}</option>`
 ).join("");
}

function orderMatchesPeriod(order){
 const value=ordersPeriodFilter?.value||"month";
 const raw=order?.createdAt||order?.created_at;
 const date=new Date(raw);
 if(Number.isNaN(date.getTime()))return false;
 const now=new Date();
 if(value==="year")return date.getFullYear()===now.getFullYear();
 if(value==="month")return date.getFullYear()===now.getFullYear()&&date.getMonth()===now.getMonth();
 const months=value==="3months"?3:6;
 const cutoff=new Date(now.getFullYear(),now.getMonth()-(months-1),1);
 return date>=cutoff;
}

function getVisibleOrders(){return ordersCache.filter(orderMatchesPeriod)}

function renderOrdersPagination(total){
 if(!ordersPagination)return;
 const pages=Math.max(1,Math.ceil(total/ORDERS_PER_PAGE));
 ordersPage=Math.min(ordersPage,pages);
 if(pages<=1){ordersPagination.innerHTML="";return;}
 ordersPagination.innerHTML=`<button type="button" class="pagination-btn" data-orders-page="prev" ${ordersPage===1?"disabled":""}>Anterior</button>
  <span class="pagination-info">Página ${ordersPage} de ${pages}</span>
  <button type="button" class="pagination-btn" data-orders-page="next" ${ordersPage===pages?"disabled":""}>Próxima</button>`;
 ordersPagination.querySelector('[data-orders-page="prev"]')?.addEventListener("click",()=>{ordersPage--;renderOrders()});
 ordersPagination.querySelector('[data-orders-page="next"]')?.addEventListener("click",()=>{ordersPage++;renderOrders()});
}

function renderOrders(){
 if(!ordersBody)return;
 const filtered=getVisibleOrders();
 const pages=Math.max(1,Math.ceil(filtered.length/ORDERS_PER_PAGE));
 ordersPage=Math.min(ordersPage,pages);
 const start=(ordersPage-1)*ORDERS_PER_PAGE;
 const orders=filtered.slice(start,start+ORDERS_PER_PAGE);
 if(ordersStatus)ordersStatus.textContent=`${filtered.length} pedido(s) no período selecionado.`;
 if(!orders.length){
  ordersBody.innerHTML='<tr><td colspan="7" class="empty-table">Nenhum pedido encontrado neste período.</td></tr>';
  renderOrdersPagination(0);
  return;
 }
 ordersBody.innerHTML=orders.map(order=>{
  const customer=order.customer||{};
  return `<tr>
   <td><strong>${esc(order.order_nsu||"—")}</strong></td>
   <td>${esc(orderDate(order.createdAt))}</td>
   <td><strong>${esc(customer.name||"—")}</strong><br><small>${esc(customer.email||customer.phone_number||"")}</small></td>
   <td>${orderMoney(order.amount)}</td>
   <td>${esc(deliveryLabel(order.delivery))}<br><small>${esc(freightLabel(order))}</small></td>
   <td><span class="order-status-badge status-${esc(order.status)}">${esc(orderStatusLabel(order.status))}</span></td>
   <td><button type="button" class="btn-outline table-action" data-order-view="${esc(order.order_nsu)}">Ver detalhes</button></td>
  </tr>`;
 }).join("");
 ordersBody.querySelectorAll("[data-order-view]").forEach(btn=>btn.addEventListener("click",()=>loadOrderDetail(btn.dataset.orderView)));
 renderOrdersPagination(filtered.length);
}

async function loadOrders(){
 try{
  showOrdersMessage("Carregando pedidos...");
  const params=new URLSearchParams();
  const search=ordersSearch?.value.trim()||"";
  const status=ordersStatusFilter?.value||"";
  if(search)params.set("q",search);
  if(status)params.set("status",status);
  const query=params.toString();
  const data=await api(`/api/admin/orders${query?`?${query}`:""}`);
  ordersCache=data.orders||[];
  ordersPage=1;
  renderOrders();
  showOrdersMessage("");
 }catch(error){
  if(ordersStatus)ordersStatus.textContent="";
  showOrdersMessage(error.message,true);
  if(ordersBody)ordersBody.innerHTML='<tr><td colspan="7" class="empty-table">Não foi possível carregar os pedidos.</td></tr>';
 }
}

function renderSuperfreteSection(order){
 const list=Array.isArray(order?.superfrete?.orders)?order.superfrete.orders:[];
 if(!list.length){
  return `<div class="detail-lines"><span class="detail-muted">Nenhuma etiqueta criada.</span></div><div class="order-superfrete-actions"><button type="button" class="btn-primary small" id="createSuperfreteBtn">Criar etiqueta SuperFrete</button></div>`;
 }
 const labels=list.map((item,index)=>`<div class="order-superfrete-label"><strong>Volume ${index+1}</strong><span>ID: ${esc(item.id||"—")}</span><span>Status: ${esc(item.status||"—")}</span><span>Rastreio: ${esc(item.tracking||"Ainda não disponível")}</span>${item.printUrl?`<a href="${esc(item.printUrl)}" target="_blank" rel="noopener noreferrer">Abrir etiqueta PDF</a>`:""}</div>`).join("");
 const needsCheckout=list.some(item=>!item.printUrl&&!/^(issued|released|completed|posted|printed|shipped|emitted|emitida|emitido|paid|pago|paga)$/i.test(String(item.status||"").trim()));
 const checkoutButton=needsCheckout?`<button type="button" class="btn-primary small" id="checkoutSuperfreteBtn">Solicitar emissão</button>`:"";
 return `<div class="order-superfrete-labels">${labels}</div><div class="order-superfrete-actions">${checkoutButton}<button type="button" class="btn-outline small" id="refreshSuperfreteBtn">Atualizar SuperFrete</button></div>`;
}

async function createSuperfreteLabel(){
 if(!currentOrder)return;
 const btn=document.getElementById("createSuperfreteBtn");
 if(btn)btn.disabled=true;
 showOrderModalMessage("Criando etiqueta na SuperFrete...");
 try{
  const data=await api(`/api/admin/orders/${encodeURIComponent(currentOrder.order_nsu)}/superfrete`,{method:"POST"});
  if(!data?.ok||!data?.order){
   throw new Error(data?.error||"A SuperFrete não confirmou a criação da etiqueta.");
  }
  currentOrder=data.order;
  renderOrderDetails(currentOrder);
  showOrderModalMessage(data.message||"Etiqueta criada na SuperFrete. Aguardando pagamento.");
 }catch(error){showOrderModalMessage(error.message,true)}finally{if(btn)btn.disabled=false}
}

async function checkoutSuperfreteLabel(){
 if(!currentOrder)return;
 if(!window.confirm("Esta ação pode efetivar a emissão e gerar cobrança na SuperFrete. Deseja continuar?"))return;
 const btn=document.getElementById("checkoutSuperfreteBtn");
 if(btn)btn.disabled=true;
 showOrderModalMessage("Solicitando emissão à SuperFrete...");
 try{
  const data=await api(`/api/admin/orders/${encodeURIComponent(currentOrder.order_nsu)}/superfrete/checkout`,{method:"POST"});
  if(!data?.ok)throw new Error(data?.error||"A SuperFrete não confirmou a solicitação.");
  showOrderModalMessage(data.message||"Solicitação enviada. Atualize o status em seguida.");
 }catch(error){
  const status=error?.httpStatus||error?.apiResponse?.superfreteStatus;
  const apiBody=error?.apiResponse?.response;
  let message=error?.message||"Falha ao solicitar emissão.";
  if(status) message+=` (HTTP ${status})`;
  if(apiBody) message+=`\nResposta da SuperFrete: ${JSON.stringify(apiBody)}`;
  showOrderModalMessage(message,true);
  console.error("Solicitar emissão SuperFrete — diagnóstico:",{message,status,apiResponse:error?.apiResponse,error});
  if(!document.getElementById("orderModalMessage")) window.alert(message);
 }
 finally{if(btn)btn.disabled=false}
}

async function refreshSuperfreteLabel(){
 if(!currentOrder)return;
 const btn=document.getElementById("refreshSuperfreteBtn");
 if(btn)btn.disabled=true;
 showOrderModalMessage("Consultando SuperFrete...");
 try{
  const data=await api(`/api/admin/orders/${encodeURIComponent(currentOrder.order_nsu)}/superfrete/refresh`,{method:"POST"});
  if(!data?.ok||!data?.order){
   throw new Error(data?.error||"A SuperFrete não confirmou a atualização dos dados.");
  }
  currentOrder=data.order;
  renderOrderDetails(currentOrder);
  const hasPrintUrl=(currentOrder?.superfrete?.orders||[]).some(item=>Boolean(item.printUrl));
  showOrderModalMessage(hasPrintUrl
   ?"Dados consultados. A SuperFrete retornou um link de impressão; se ele apresentar erro, a falha está no serviço de impressão da SuperFrete."
   :"Consulta concluída, mas a SuperFrete ainda não retornou o link da etiqueta. Verifique novamente depois que o pedido for processado.");
  await loadOrders();
 }catch(error){showOrderModalMessage(error.message,true)}finally{if(btn)btn.disabled=false}
}

function renderOrderDetails(order){
 const customer=order.customer||{};
 const address=order.address||{};
 const storeItems=Array.isArray(order.store_items)&&order.store_items.length
  ? order.store_items
  : (Array.isArray(order.items)?order.items.map(item=>({name:item.description||"Produto",quantity:item.quantity||0,unitPrice:(Number(item.price)||0)/100})):[]);
 const addressHtml=address && Object.keys(address).length
  ? `<div class="detail-lines"><span>${esc(address.street||"")}${address.number?`, ${esc(address.number)}`:""}</span><span>${esc(address.complement||"")}</span><span>${esc(address.neighborhood||"")}</span><span>${esc(address.city||"")}${address.state?`/${esc(address.state)}`:""}</span><span>CEP ${esc(address.cep||"—")}</span></div>`
  : `<p class="detail-muted">Nenhum endereço informado.</p>`;
 const itemsHtml=storeItems.length
  ? `<div class="order-items">${storeItems.map(item=>`<div class="order-item"><div><strong>${esc(item.name||item.description||"Produto")}</strong><span>${Number(item.quantity||0)} × ${money(item.unitPrice||0)}</span></div><strong>${money((Number(item.unitPrice)||0)*(Number(item.quantity)||0))}</strong></div>`).join("")}</div>`
  : `<p class="detail-muted">Nenhum item registrado.</p>`;
 const freight=Number(order?.freight?.price||0);
 const transactionHtml=order.transaction_nsu||order.invoice_slug||order.receipt_url||order.capture_method||order.paidAt
  ? `<div class="detail-lines"><span><strong>Transaction NSU:</strong> ${esc(order.transaction_nsu||"—")}</span><span><strong>Invoice:</strong> ${esc(order.invoice_slug||"—")}</span><span><strong>Forma:</strong> ${esc(order.capture_method||"—")}</span><span><strong>Pago em:</strong> ${esc(orderDate(order.paidAt))}</span>${order.receipt_url?`<span><strong>Comprovante:</strong> <a href="${esc(order.receipt_url)}" target="_blank" rel="noopener noreferrer">abrir</a></span>`:""}</div>`
  : `<p class="detail-muted">Nenhum dado de transação registrado.</p>`;
 orderModalBody.innerHTML=`
  <div class="order-detail-grid">
   <div class="order-detail-card"><h4>Cliente</h4><div class="detail-lines"><span><strong>Nome:</strong> ${esc(customer.name||"—")}</span><span><strong>E-mail:</strong> ${esc(customer.email||"—")}</span><span><strong>Telefone:</strong> ${esc(customer.phone_number||customer.phone||"—")}</span></div></div>
   <div class="order-detail-card"><h4>Entrega</h4><div class="detail-lines"><span><strong>Tipo:</strong> ${esc(deliveryLabel(order.delivery))}</span><span><strong>Serviço:</strong> ${esc(freightLabel(order))}</span><span><strong>Frete:</strong> ${money(freight)}</span></div></div>
   <div class="order-detail-card order-detail-card-wide"><h4>Endereço</h4>${addressHtml}</div>
   <div class="order-detail-card order-detail-card-wide"><h4>Produtos</h4>${itemsHtml}</div>
   <div class="order-detail-card"><h4>Valores</h4><div class="detail-lines"><span><strong>Total:</strong> ${orderMoney(order.amount)}</span><span><strong>Criado:</strong> ${esc(orderDate(order.createdAt))}</span><span><strong>Atualizado:</strong> ${esc(orderDate(order.updatedAt))}</span></div></div>
   <div class="order-detail-card"><h4>Pagamento</h4>${transactionHtml}</div>
  </div>
  <div class="order-status-editor"><label for="orderStatusSelect">Status do pedido</label><select id="orderStatusSelect">${renderOrderStatusOptions(order.status)}</select></div>
  <div class="order-detail-card order-detail-card-wide superfrete-card"><h4>SuperFrete</h4>${renderSuperfreteSection(order)}</div>
  <div class="order-tracking-editor">
   <h4>Rastreamento / envio</h4>
   <div class="tracking-form-grid">
    <label>Transportadora<input id="orderTrackingCarrier" type="text" value="${esc(order?.tracking?.carrier||"")}" placeholder="Correios / SuperFrete"></label>
    <label>Serviço<input id="orderTrackingService" type="text" value="${esc(order?.tracking?.service||freightLabel(order)||"")}" placeholder="SEDEX / PAC"></label>
    <label class="tracking-wide">Código de rastreio<input id="orderTrackingCode" type="text" value="${esc(order?.tracking?.code||"")}" placeholder="Ex.: AB123456789BR"></label>
    <label class="tracking-wide">Link de acompanhamento<input id="orderTrackingUrl" type="url" value="${esc(order?.tracking?.url||"")}" placeholder="https://..."></label>
   </div>
   ${order?.tracking?.shippedAt?`<p class="tracking-saved">Enviado em: ${esc(orderDate(order.tracking.shippedAt))}</p>`:""}
   <button type="button" class="btn-primary small" id="saveOrderTrackingBtn">Salvar rastreio e marcar como enviado</button>
  </div>`;
 const createBtn=document.getElementById("createSuperfreteBtn");
 const refreshBtn=document.getElementById("refreshSuperfreteBtn");
 createBtn?.addEventListener("click",createSuperfreteLabel);
 const checkoutBtn=document.getElementById("checkoutSuperfreteBtn");
 if(checkoutBtn){
  checkoutBtn.onclick=async function(event){
   event.preventDefault();
   event.stopPropagation();
   try { await checkoutSuperfreteLabel(); }
   catch(error){ console.error("Falha no botão Solicitar emissão:",error); window.alert(error?.message||"Não foi possível solicitar a emissão. Consulte o console do navegador."); }
  };
 }
 refreshBtn?.addEventListener("click",refreshSuperfreteLabel);
 document.getElementById("saveOrderTrackingBtn")?.addEventListener("click",saveOrderTracking);
}

async function loadOrderDetail(orderNsu){
 try{
  showOrderModalMessage("Carregando...");
  orderModal.hidden=false;
  document.body.classList.add("modal-open");
  const data=await api(`/api/admin/orders/${encodeURIComponent(orderNsu)}`);
  currentOrder=data.order;
  orderModalTitle.textContent=`Pedido ${currentOrder.order_nsu||""}`;
  renderOrderDetails(currentOrder);
  showOrderModalMessage("");
 }catch(error){
  showOrderModalMessage(error.message,true);
 }
}

function closeOrderModal(){
 orderModal.hidden=true;
 document.body.classList.remove("modal-open");
 currentOrder=null;
 showOrderModalMessage("");
}

async function saveOrderStatus(){
 if(!currentOrder)return;
 const select=document.getElementById("orderStatusSelect");
 const status=select?.value||"";
 if(!status)return;
 saveOrderStatusBtn.disabled=true;
 showOrderModalMessage("Salvando status...");
 try{
  const data=await api(`/api/admin/orders/${encodeURIComponent(currentOrder.order_nsu)}/status`,{
   method:"PATCH",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify({status})
  });
  currentOrder=data.order;
  renderOrderDetails(currentOrder);
  showOrderModalMessage("Status atualizado com sucesso.");
  await loadOrders();
 }catch(error){
  showOrderModalMessage(error.message,true);
 }finally{
  saveOrderStatusBtn.disabled=false;
 }
}

async function saveOrderTracking(){
 if(!currentOrder)return;
 const code=document.getElementById("orderTrackingCode")?.value.trim()||"";
 const carrier=document.getElementById("orderTrackingCarrier")?.value.trim()||"";
 const service=document.getElementById("orderTrackingService")?.value.trim()||"";
 const url=document.getElementById("orderTrackingUrl")?.value.trim()||"";
 if(!code){showOrderModalMessage("Informe o código de rastreio.",true);return;}
 const button=document.getElementById("saveOrderTrackingBtn");
 if(button)button.disabled=true;
 showOrderModalMessage("Salvando rastreio...");
 try{
  const data=await api(`/api/admin/orders/${encodeURIComponent(currentOrder.order_nsu)}/tracking`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({carrier,service,trackingCode:code,trackingUrl:url})});
  currentOrder=data.order;
  renderOrderDetails(currentOrder);
  showOrderModalMessage("Rastreio salvo e pedido marcado como enviado.");
  await loadOrders();
 }catch(error){showOrderModalMessage(error.message,true)}finally{if(button)button.disabled=false}
}

refreshOrdersBtn?.addEventListener("click",loadOrders);
ordersStatusFilter?.addEventListener("change",loadOrders);
ordersPeriodFilter?.addEventListener("change",()=>{ordersPage=1;renderOrders()});

function activateAdminSection(id,button){const target=document.getElementById(id);if(!target)return;document.querySelectorAll("[data-admin-panel]").forEach(panel=>{panel.hidden=panel!==target;});document.querySelectorAll(".admin-section-tab").forEach(tab=>tab.classList.toggle("is-active",tab===button));target.scrollIntoView({behavior:"smooth",block:"start"});if(id==="familias-olfativas")loadOlfactoryFamilies();}
document.querySelectorAll("[data-admin-target]").forEach(button=>button.addEventListener("click",()=>activateAdminSection(button.dataset.adminTarget,button)));
document.querySelectorAll("[data-admin-panel]").forEach(panel=>{panel.hidden=panel.id!=="catalogo";});
let ordersSearchTimer=null;
ordersSearch?.addEventListener("input",()=>{
 clearTimeout(ordersSearchTimer);
 ordersSearchTimer=setTimeout(loadOrders,300);
});
closeOrderModalBtn?.addEventListener("click",closeOrderModal);
cancelOrderModalBtn?.addEventListener("click",closeOrderModal);
orderModal?.querySelector("[data-order-close]")?.addEventListener("click",closeOrderModal);
saveOrderStatusBtn?.addEventListener("click",saveOrderStatus);
document.addEventListener("keydown",event=>{if(event.key==="Escape"&&!orderModal?.hidden)closeOrderModal()});

const productEditModal=document.getElementById("productEditModal");
document.getElementById("closeProductEditBtn")?.addEventListener("click",closeProductEdit);
document.getElementById("cancelProductEditBtn")?.addEventListener("click",closeProductEdit);
document.getElementById("saveProductEditBtn")?.addEventListener("click",saveProductEdit);
productEditModal?.querySelector("[data-product-edit-close]")?.addEventListener("click",closeProductEdit);

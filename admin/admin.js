const loginForm=document.getElementById("adminLoginForm");
const loginMessage=document.getElementById("loginMessage");
const loginCard=document.getElementById("loginCard");
const dashboardShell=document.getElementById("dashboardShell");
const logoutBtn=document.getElementById("logoutBtn");
const productForm=document.getElementById("productForm");
const productMessage=document.getElementById("productMessage");
const productsBody=document.getElementById("productsBody");
const catalogStatus=document.getElementById("catalogStatus");
const importBox=document.getElementById("importBox");
const importCatalogBtn=document.getElementById("importCatalogBtn");
let selectedImages=["","",""];

function showMessage(text){if(loginMessage)loginMessage.textContent=text}
function showProductMessage(text){if(productMessage)productMessage.textContent=text}
function showDashboard(){loginCard.hidden=true;dashboardShell.hidden=false}
function showLogin(){dashboardShell.hidden=true;loginCard.hidden=false}
function esc(v){return String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;")}
function money(v){return Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}
function cat(v){return({"brand-masc":"Brand Collections Masc.","brand-fem":"Brand Collections Fem.","arabe-masc":"Perfumes Árabes Masc.","arabe-fem":"Perfumes Árabes Fem.","body-splash":"Body Splash","arabic-collection":"Arabic Collections","kits":"Kits","outlet":"Outlet"})[v]||v||"—"}

async function api(url,options={}){
 const response=await fetch(url,{credentials:"same-origin",cache:"no-store",...options});
 const data=await response.json().catch(()=>({}));
 if(response.status===401){showLogin();throw new Error("Sua sessão administrativa expirou.")}
 if(!response.ok)throw new Error(data.error||"Não foi possível concluir a operação.");
 return data;
}

async function loadProducts(){
 try{
  const data=await api("/api/admin/products");
  const products=data.products||[];
  catalogStatus.textContent=`${products.length} produto(s) no catálogo do servidor.`;
  if(!products.length){productsBody.innerHTML='<tr><td colspan="8" style="text-align:center;padding:20px;color:#777;">Nenhum produto cadastrado.</td></tr>';return}
  productsBody.innerHTML=products.map(p=>`<tr>
   <td>${p.image?`<img class="product-thumb" src="${esc(p.image)}" alt="${esc(p.name)}">`:"—"}</td>
   <td>${esc(p.name)}</td><td>${esc(p.brand||"—")}</td><td>${esc(cat(p.category))}</td>
   <td>${p.volume?Number(p.volume)+" ml":"—"}</td>
   <td>${p.originalPrice&&Number(p.originalPrice)>Number(p.price)?`<del>${money(p.originalPrice)}</del><br>${money(p.price)}`:money(p.price)}</td>
   <td>${Number(p.stock||0)}</td><td><button class="remove-link" type="button" data-delete="${esc(p.id)}">remover</button></td>
  </tr>`).join("");
  productsBody.querySelectorAll("[data-delete]").forEach(btn=>btn.addEventListener("click",async()=>{
   const name=btn.closest("tr")?.children[1]?.textContent||"este produto";
   if(!confirm(`Remover o produto "${name}"?`))return;
   try{await api(`/api/admin/products/${encodeURIComponent(btn.dataset.delete)}`,{method:"DELETE"});showProductMessage("Produto removido com sucesso.");await loadProducts()}
   catch(e){showProductMessage(e.message)}
  }));
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
 const removeBtn=document.getElementById(`removeImageBtn${index+1}`);
 if(!preview)return;
 if(selectedImages[index]){
  preview.innerHTML=`<img src="${esc(selectedImages[index])}" alt="Prévia da foto ${index+1}">`;
  if(removeBtn)removeBtn.hidden=false;
 }else{
  preview.textContent=`Foto ${index+1}`;
  if(removeBtn)removeBtn.hidden=true;
 }
}

for(let i=0;i<3;i++){
 document.getElementById(`chooseImageBtn${i+1}`)?.addEventListener("click",()=>{
  document.getElementById(`newImage${i+1}`)?.click();
 });
 document.getElementById(`removeImageBtn${i+1}`)?.addEventListener("click",()=>{
  selectedImages[i]="";
  const input=document.getElementById(`newImage${i+1}`);
  if(input)input.value="";
  renderPhotoSlot(i);
 });
 document.getElementById(`newImage${i+1}`)?.addEventListener("change",async e=>{
  try{
   selectedImages[i]=await compress(e.target.files?.[0]);
   renderPhotoSlot(i);
  }catch(err){
   selectedImages[i]="";
   e.target.value="";
   renderPhotoSlot(i);
   showProductMessage(err.message);
  }
 });
}

productForm?.addEventListener("submit",async e=>{
 e.preventDefault();showProductMessage("Cadastrando...");
 const price=Number(document.getElementById("newPrice").value);
 const originalPrice=Number(document.getElementById("newOriginalPrice").value||0);
 if(originalPrice>0&&originalPrice<price){showProductMessage("O preço original deve ser maior ou igual ao preço de venda.");return}
 const product={
  name:document.getElementById("newName").value.trim(),brand:document.getElementById("newBrand").value.trim(),
  category:document.getElementById("newCat").value,gender:document.getElementById("newGender").value,
  volume:Number(document.getElementById("newVolume").value||0),price,originalPrice,
  stock:Number(document.getElementById("newStock").value||0),desc:document.getElementById("newDesc").value.trim(),
  isLaunch:document.getElementById("newIsLaunch").checked,isFeatured:document.getElementById("newIsFeatured").checked,
  images:selectedImages.filter(Boolean),image:selectedImages.find(Boolean)||""
 };
 try{
  await api("/api/admin/products",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(product)});
  productForm.reset();document.getElementById("newStock").value="1";document.getElementById("newIsLaunch").checked=true;
  selectedImages=["","",""];
  for(let i=0;i<3;i++){const input=document.getElementById(`newImage${i+1}`);if(input)input.value="";renderPhotoSlot(i)}
  showProductMessage("Produto cadastrado com sucesso.");await loadProducts();
 }catch(err){showProductMessage(err.message)}
});

function checkLocalCatalog(){
 try{
  const saved=localStorage.getItem("catalog"),products=saved?JSON.parse(saved):null;
  importBox.hidden=!(Array.isArray(products)&&products.length);
 }catch{importBox.hidden=true}
}

importCatalogBtn?.addEventListener("click",async()=>{
 try{
  const saved=localStorage.getItem("catalog"),products=saved?JSON.parse(saved):null;
  if(!Array.isArray(products)||!products.length){showProductMessage("Nenhum catálogo local foi encontrado.");return}
  if(!confirm(`Importar ${products.length} produto(s) deste navegador? Isso substituirá o catálogo do servidor.`))return;
  showProductMessage("Importando catálogo...");
  const data=await api("/api/admin/catalog/import",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({products})});
  importBox.hidden=true;showProductMessage(`${data.imported} produto(s) importado(s) com sucesso.`);await loadProducts();
 }catch(err){showProductMessage(err.message)}
});

document.getElementById("refreshProductsBtn")?.addEventListener("click",loadProducts);

async function checkSession(){
 try{const data=await api("/api/admin/me");if(data.authenticated){showDashboard();await loadProducts();await loadBanners();await loadOrders();checkLocalCatalog()}else showLogin()}
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
  document.getElementById("adminPassword").value="";showMessage("");showDashboard();await loadProducts();await loadBanners();await loadOrders();checkLocalCatalog();
 }catch{showMessage("Não foi possível conectar ao servidor. Verifique se o server.js está rodando.")}
});

logoutBtn?.addEventListener("click",async()=>{try{await fetch("/api/admin/logout",{method:"POST",credentials:"same-origin"})}finally{showLogin()}});
checkSession();


const bannerMessage = document.getElementById("bannerMessage");
const bannersAdminGrid = document.getElementById("bannersAdminGrid");
const refreshBannersBtn = document.getElementById("refreshBannersBtn");

const BANNER_CATEGORIES = [
 {id:"brand-masc",label:"Brand Collections Masc."},
 {id:"brand-fem",label:"Brand Collections Fem."},
 {id:"arabe-masc",label:"Perfumes Árabes Masc."},
 {id:"arabe-fem",label:"Perfumes Árabes Fem."},
 {id:"body-splash",label:"Body Splash"},
 {id:"arabic-collection",label:"Arabic Collections"},
 {id:"kits",label:"Kits"},
 {id:"outlet",label:"Outlet"}
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

function renderBanners(banners){
 if(!bannersAdminGrid)return;
 bannersAdminGrid.innerHTML=(banners||[]).map((banner,index)=>`\
  <article class="banner-admin-card" data-banner-card="${index}">\
   <div class="banner-admin-preview"><img src="${esc(banner.image)}" alt="Prévia do banner ${index+1}" data-banner-preview="${index}"></div>\
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
   const preview=card.querySelector(`[data-banner-preview="${index}"]`); if(preview&&data.banner?.image)preview.src=data.banner.image;
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
   PEDIDOS — FASE 2
   ========================================================= */

const refreshOrdersBtn = document.getElementById("refreshOrdersBtn");
const ordersSearch = document.getElementById("ordersSearch");
const ordersStatusFilter = document.getElementById("ordersStatusFilter");
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

function renderOrders(orders){
 if(!ordersBody)return;
 if(!orders.length){
  ordersBody.innerHTML='<tr><td colspan="7" class="empty-table">Nenhum pedido encontrado.</td></tr>';
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
  const orders=data.orders||[];
  if(ordersStatus)ordersStatus.textContent=`${orders.length} pedido(s) encontrado(s).`;
  renderOrders(orders);
  showOrdersMessage("");
 }catch(error){
  if(ordersStatus)ordersStatus.textContent="";
  showOrdersMessage(error.message,true);
  if(ordersBody)ordersBody.innerHTML='<tr><td colspan="7" class="empty-table">Não foi possível carregar os pedidos.</td></tr>';
 }
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
  <div class="order-status-editor"><label for="orderStatusSelect">Status do pedido</label><select id="orderStatusSelect">${renderOrderStatusOptions(order.status)}</select></div>`;
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

refreshOrdersBtn?.addEventListener("click",loadOrders);
ordersStatusFilter?.addEventListener("change",loadOrders);
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

/* NAVEGACAO DO PAINEL — SECOES */
const adminSectionTabs = document.querySelectorAll("[data-admin-section]");
const adminSectionPanels = document.querySelectorAll("[data-admin-panel]");

function showAdminSection(section) {
  adminSectionTabs.forEach(tab => {
    const active = tab.dataset.adminSection === section;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
  });
  adminSectionPanels.forEach(panel => {
    panel.hidden = panel.dataset.adminPanel !== section;
  });
}

adminSectionTabs.forEach(tab => {
  tab.addEventListener("click", () => {
    showAdminSection(tab.dataset.adminSection);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
});

if (adminSectionTabs.length && adminSectionPanels.length) {
  showAdminSection("catalogo");
}


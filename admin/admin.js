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
let selectedImage="";

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

document.getElementById("newImage")?.addEventListener("change",async e=>{
 try{selectedImage=await compress(e.target.files?.[0]);document.getElementById("photoPreview").innerHTML=`<img src="${esc(selectedImage)}" alt="Prévia do produto">`}
 catch(err){selectedImage="";e.target.value="";showProductMessage(err.message)}
});

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
  isLaunch:document.getElementById("newIsLaunch").checked,isFeatured:document.getElementById("newIsFeatured").checked,image:selectedImage
 };
 try{
  await api("/api/admin/products",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(product)});
  productForm.reset();document.getElementById("newStock").value="1";document.getElementById("newIsLaunch").checked=true;
  selectedImage="";document.getElementById("photoPreview").textContent="Nenhuma foto selecionada";
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
 try{const data=await api("/api/admin/me");if(data.authenticated){showDashboard();await loadProducts();checkLocalCatalog()}else showLogin()}
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
  document.getElementById("adminPassword").value="";showMessage("");showDashboard();await loadProducts();checkLocalCatalog();
 }catch{showMessage("Não foi possível conectar ao servidor. Verifique se o server.js está rodando.")}
});

logoutBtn?.addEventListener("click",async()=>{try{await fetch("/api/admin/logout",{method:"POST",credentials:"same-origin"})}finally{showLogin()}});
checkSession();

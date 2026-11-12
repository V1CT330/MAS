import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "../lib/supabase";

type Props = { listingId: string; onBack: () => void };
type ListingRow = { id:string; name:string; kind:string; category:string; status:string; tagline:string|null; description:string|null; icon_url:string|null; screenshots:string[]|null; website_url:string|null; rejection_reason?:string|null };
type Check = { label:string; hint:string; ok:boolean };
type PickedImage = ImagePicker.ImagePickerAsset;
async function uploadImage(userId:string,asset:PickedImage,folder:string){
 const response=await fetch(asset.uri);
 if(!response.ok)throw new Error("Could not read the selected image.");
 const body=await response.arrayBuffer();
 if(!body.byteLength||body.byteLength>10*1024*1024)throw new Error("Each image must be larger than 0 bytes and no larger than 10 MB.");
 const mime=asset.mimeType??"image/jpeg";
 if(!mime.startsWith("image/"))throw new Error("Choose a valid image file.");
 const ext=(asset.fileName?.split(".").pop()?.toLowerCase()||({ "image/png":"png","image/webp":"webp","image/gif":"gif","image/avif":"avif" } as Record<string,string>)[mime]||"jpg").replace(/[^a-z0-9]/g,"");
 const path=userId+"/"+folder+"/"+Date.now()+"-"+Math.random().toString(36).slice(2,8)+"."+ext;
 const {error}=await supabase.storage.from("app-assets").upload(path,body,{upsert:false,contentType:mime});
 if(error)throw error;
 return path;
}
function checksFor(l:ListingRow):Check[] {
 const website=l.kind==="website";
 const rows:Check[]=[
  {label:"Product name",ok:l.name.trim().length>=3,hint:"At least 3 characters."},
  {label:"Short description",ok:(l.tagline?.trim().length??0)>=20,hint:"20 characters or more."},
  {label:"Full description",ok:(l.description?.trim().length??0)>=200,hint:"200 characters or more."},
  {label:"Category",ok:Boolean(l.category),hint:"Choose the closest category."},
  {label:website?"Logo or thumbnail":"App icon",ok:Boolean(l.icon_url),hint:"Add a square image, at least 512px."},
  {label:website?"Preview screenshots":"Screenshots",ok:(l.screenshots?.length??0)>=2,hint:"Add at least 2 images."}
 ];
 if(website) rows.push({label:"Website address",ok:/^https?:\/\/.+\..+/.test(l.website_url??""),hint:"Enter a full website URL."});
 return rows;
}
export default function NativeListingDetailScreen({listingId,onBack}:Props){
 const [listing,setListing]=useState<ListingRow|null>(null);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [tagline,setTagline]=useState("");
 const [description,setDescription]=useState("");
 const [newIcon,setNewIcon]=useState<PickedImage|null>(null);
 const [newScreenshots,setNewScreenshots]=useState<PickedImage[]>([]);
 const [clearIcon,setClearIcon]=useState(false);
 const [replaceScreenshots,setReplaceScreenshots]=useState(false);
 const refresh=useCallback(async()=>{
  setLoading(true);
  const {data,error}=await supabase.from("listings").select("id,name,kind,category,status,tagline,description,icon_url,screenshots,website_url,rejection_reason").eq("id",listingId).single();
  if(error||!data){setListing(null);setMessage(error?.message??"Listing unavailable.");setLoading(false);return;}
  const row=data as ListingRow;setListing(row);setTagline(row.tagline??"");setDescription(row.description??"");setLoading(false);
 },[listingId]);
 useEffect(()=>{void refresh();},[refresh]);
 const checks=useMemo(()=>listing?checksFor(listing):[],[listing]);
 const score=checks.length?Math.round(checks.filter(x=>x.ok).length/checks.length*100):0;
 const pickMedia=async(target:"icon"|"screenshots")=>{
  try{
   const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:["images"],allowsMultipleSelection:target==="screenshots",selectionLimit:target==="screenshots"?8:1,quality:0.9});
   if(result.canceled)return;
   const selected=result.assets;
   if(selected.some(x=>!x.uri||x.fileSize===0||(x.fileSize??0)>10*1024*1024||!(x.mimeType??"image/jpeg").startsWith("image/"))){setMessage("Choose valid image files up to 10 MB each.");return;}
   if(target==="icon"){setNewIcon(selected[0]??null);setClearIcon(false);}
   else{setNewScreenshots(selected.slice(0,8));setReplaceScreenshots(true);}
   setMessage("");
  }catch(e){setMessage(e instanceof Error?e.message:"Could not open the image picker.");}
 };
 const saveMedia=async()=>{
  if(!listing)return;
  if(!newIcon&&!replaceScreenshots&&!clearIcon)return;
  setBusy(true);setMessage("");
  const uploaded:string[]=[];
  try{
   const {data:auth,error:authError}=await supabase.auth.getUser();
   if(authError||!auth.user)throw new Error("Sign in to edit listing images.");
   let iconPath=listing.icon_url;
   let screenshotPaths=listing.screenshots??[];
   if(newIcon){iconPath=await uploadImage(auth.user.id,newIcon,"icons");uploaded.push(iconPath);}
   if(clearIcon)iconPath=null;
   if(replaceScreenshots){screenshotPaths=[];for(const item of newScreenshots){const path=await uploadImage(auth.user.id,item,"screenshots");screenshotPaths.push(path);uploaded.push(path);}}
   const {error}=await supabase.from("listings").update({icon_url:iconPath,screenshots:screenshotPaths}).eq("id",listingId);
   if(error)throw error;
   setNewIcon(null);setNewScreenshots([]);setClearIcon(false);setReplaceScreenshots(false);
   await refresh();
   const oldPaths=[...(newIcon&&listing.icon_url?[listing.icon_url]:[]),...(clearIcon&&listing.icon_url?[listing.icon_url]:[]),...(replaceScreenshots?(listing.screenshots??[]):[])];
   if(oldPaths.length){
    const {error:cleanupError}=await supabase.storage.from("app-assets").remove(oldPaths);
    setMessage(cleanupError?"Listing images saved. Old files could not be cleaned up and may need manual cleanup.":"Listing images saved.");
   }else setMessage("Listing images saved.");
  }catch(e){
   if(uploaded.length)await supabase.storage.from("app-assets").remove(uploaded);
   setMessage(e instanceof Error?e.message:"Could not save listing images.");
  }finally{setBusy(false);}
 };
 const saveDetails=async()=>{
  if(!listing)return;
  setBusy(true);setMessage("");
  try{
   const {error}=await supabase.from("listings").update({tagline:tagline.trim(),description:description.trim()}).eq("id",listingId);
   if(error)throw error;
   await refresh();setMessage("Listing details saved.");
  }catch(e){setMessage(e instanceof Error?e.message:"Could not save listing details.");}
  finally{setBusy(false);}
 };
 const runChecks=async()=>{
  setBusy(true);setMessage("");
  try{
   const {data,error}=await supabase.rpc("attempt_auto_publish",{_listing_id:listingId});
   if(error)throw error;
   await refresh();
   const result=data as {message?:string;reasons?:string[]};
   setMessage(result.message??result.reasons?.join(" ")??"Publishing checks completed.");
  }catch(e){setMessage(e instanceof Error?e.message:"Could not run publishing checks.");}
  finally{setBusy(false);}
 };
 if(loading)return <View style={s.center}><ActivityIndicator color="#1A73E8"/></View>;
 if(!listing)return <View style={s.panel}><Text style={s.title}>Listing unavailable</Text><Text style={s.copy}>{message}</Text><TouchableOpacity onPress={onBack} style={s.button}><Text style={s.buttonText}>Back to products</Text></TouchableOpacity></View>;
 return <ScrollView contentContainerStyle={s.content}>
  <TouchableOpacity onPress={onBack} style={s.back}><Text style={s.backText}>‹  All products</Text></TouchableOpacity>
  <View style={s.header}><Text style={s.eyebrow}>LISTING OVERVIEW</Text><Text style={s.title}>{listing.name}</Text><Text style={s.copy}>{listing.kind.replace("_"," ")} · {listing.category}</Text><View style={s.status}><Text style={s.statusText}>{listing.status==="published"?"Live":listing.status==="pending"?"In review":listing.status}</Text></View></View>
  {listing.rejection_reason?<View style={s.panel}><Text style={s.panelTitle}>Review feedback</Text><Text style={s.copy}>{listing.rejection_reason}</Text></View>:null}
  {listing.status==="draft"||listing.status==="rejected"?<View style={s.panel}><Text style={s.panelTitle}>Listing images</Text><Text style={s.mediaInfo}>Current icon: {listing.icon_url?"Added":"Not added"} · Screenshots: {listing.screenshots?.length??0}</Text><TouchableOpacity style={s.secondaryButton} onPress={()=>void pickMedia("icon")}><Text style={s.secondaryText}>{newIcon?"Choose a different icon": "Replace icon"}</Text></TouchableOpacity>{listing.icon_url?<TouchableOpacity onPress={()=>{setClearIcon(true);setNewIcon(null);}}><Text style={s.removeText}>Remove current icon</Text></TouchableOpacity>:null}<TouchableOpacity style={s.secondaryButton} onPress={()=>void pickMedia("screenshots")}><Text style={s.secondaryText}>{replaceScreenshots?"Choose different screenshots":"Replace screenshots"}</Text></TouchableOpacity>{replaceScreenshots?<Text style={s.mediaInfo}>{newScreenshots.length} new screenshot(s) selected. This replaces the current set.</Text>:null}<TouchableOpacity disabled={busy||(!newIcon&&!replaceScreenshots&&!clearIcon)} onPress={()=>void saveMedia()} style={[s.button,(busy||(!newIcon&&!replaceScreenshots&&!clearIcon))&&s.disabled]}>{busy?<ActivityIndicator color="#FFF"/>:<Text style={s.buttonText}>Save images</Text>}</TouchableOpacity></View>:null}
  {listing.status==="draft"||listing.status==="rejected"?<View style={s.panel}><Text style={s.panelTitle}>Edit listing details</Text><Text style={s.fieldLabel}>Tagline · {tagline.trim().length}/20 characters minimum</Text><TextInput value={tagline} onChangeText={setTagline} maxLength={90} placeholder="One line about your product" style={s.input}/><Text style={s.fieldLabel}>Description · {description.trim().length}/200 characters minimum</Text><TextInput value={description} onChangeText={setDescription} multiline maxLength={2000} textAlignVertical="top" placeholder="Describe what it does and who it helps" style={[s.input,s.multiline]}/><TouchableOpacity disabled={busy} onPress={()=>void saveDetails()} style={[s.button,busy&&s.disabled]}>{busy?<ActivityIndicator color="#FFF"/>:<Text style={s.buttonText}>Save details</Text>}</TouchableOpacity></View>:null}
  <View style={s.panel}><View style={s.row}><Text style={s.panelTitle}>Submission checklist</Text><Text style={s.score}>{score}%</Text></View><View style={s.track}><View style={[s.progress,{width:score+"%"}]}/></View>
   {checks.map(x=><View key={x.label} style={s.checkRow}><Text style={[s.mark,{color:x.ok?"#188038":"#9AA0A6"}]}>{x.ok?"✓":"○"}</Text><View style={s.flex}><Text style={s.checkTitle}>{x.label}</Text>{!x.ok?<Text style={s.hint}>{x.hint}</Text>:null}</View></View>)}
   <Text style={s.note}>Automated checks and store review determine whether a listing can go live. KYC and package security review still apply.</Text>
   {(listing.status==="draft"||listing.status==="rejected")?<TouchableOpacity disabled={busy} onPress={()=>void runChecks()} style={[s.button,busy&&s.disabled]}>{busy?<ActivityIndicator color="#FFF"/>:<Text style={s.buttonText}>{listing.status==="rejected"?"Run checks again":"Run checks & publish"}</Text>}</TouchableOpacity>:null}
   {message?<Text style={s.message}>{message}</Text>:null}
  </View>
 </ScrollView>;
}
const s=StyleSheet.create({content:{padding:16,paddingBottom:32},center:{padding:32,alignItems:"center"},back:{paddingVertical:8},backText:{color:"#1A73E8",fontSize:14,fontWeight:"600"},header:{marginBottom:14},eyebrow:{fontSize:10,letterSpacing:1,color:"#5F6368",fontWeight:"700"},title:{fontSize:23,color:"#202124",fontWeight:"700",marginTop:5},copy:{fontSize:13,color:"#5F6368",lineHeight:19,marginTop:5},status:{alignSelf:"flex-start",backgroundColor:"#E8F0FE",borderRadius:18,paddingHorizontal:12,paddingVertical:6,marginTop:10},statusText:{fontSize:12,color:"#174EA6",fontWeight:"700",textTransform:"capitalize"},panel:{backgroundColor:"#FFF",borderColor:"#E8EAED",borderWidth:1,borderRadius:16,padding:16,marginBottom:12},panelTitle:{fontSize:16,color:"#202124",fontWeight:"700"},fieldLabel:{fontSize:12,color:"#3C4043",fontWeight:"600",marginTop:14,marginBottom:6},mediaInfo:{fontSize:12,color:"#5F6368",marginTop:8,lineHeight:18},secondaryButton:{minHeight:42,borderRadius:22,borderWidth:1,borderColor:"#DADCE0",alignItems:"center",justifyContent:"center",marginTop:10,paddingHorizontal:12},secondaryText:{fontSize:13,color:"#1A73E8",fontWeight:"600"},removeText:{fontSize:12,color:"#B3261E",marginTop:10},input:{minHeight:46,borderWidth:1,borderColor:"#DADCE0",borderRadius:11,paddingHorizontal:12,paddingVertical:10,color:"#202124",backgroundColor:"#FFF",fontSize:13},multiline:{minHeight:130,paddingTop:12},row:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},score:{fontSize:15,color:"#1A73E8",fontWeight:"700"},track:{height:7,borderRadius:8,backgroundColor:"#E8EAED",overflow:"hidden",marginTop:12,marginBottom:8},progress:{height:7,backgroundColor:"#1A73E8",borderRadius:8},checkRow:{flexDirection:"row",alignItems:"flex-start",paddingVertical:10,borderBottomWidth:1,borderBottomColor:"#F1F3F4",gap:10},mark:{fontSize:16,fontWeight:"700",width:20},flex:{flex:1},checkTitle:{fontSize:13,color:"#202124",fontWeight:"600"},hint:{fontSize:11,color:"#5F6368",marginTop:3},note:{fontSize:11,color:"#5F6368",lineHeight:16,marginTop:12},button:{minHeight:46,borderRadius:24,backgroundColor:"#1A73E8",alignItems:"center",justifyContent:"center",marginTop:16,paddingHorizontal:16},buttonText:{color:"#FFF",fontSize:13,fontWeight:"700"},disabled:{opacity:.6},message:{fontSize:12,color:"#3C4043",lineHeight:18,marginTop:12}});

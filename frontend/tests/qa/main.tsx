// Isolated browser fixtures; never imported by production entry points.
import { createRoot } from "react-dom/client";
import { useState } from "react";
import { ProjectsDirectory } from "../../components/projects-directory";
import { ElectroTechSite } from "../../components/electro-tech-site";
import "../../app/globals.css";
import type { PublicProject } from "../../types/project";
import type { ProjectReview } from "../../types/project-review";
const project: PublicProject = {
 id:"11111111-1111-1111-1111-111111111111",slug:"qa-solar",title:"QA Solar Installation",clientOrganization:"QA Client",
 location:"Attock",size:"10 kW",category:"Complete Solar System Installation",completionDate:"2026-09-15",completionYear:2026,
 shortSummary:"Isolated fixture for local responsive verification.",fullStory:"Project story and technical breakdown for isolated local QA.",
 description:null,equipment:[],status:"published",isFeaturedHomepage:true,homepageOrder:1,publishedAt:"2026-09-15T00:00:00Z",createdAt:"2026-09-15T00:00:00Z",updatedAt:"2026-09-15T00:00:00Z",
 images:[{id:"image",url:"/images/hero-solar-architectural.webp",altText:"Solar installation",caption:null,isPrimary:true,sortOrder:0}],mainImage:null,
};
const reviews: ProjectReview[] = Array.from({length:23},(_,index)=>({
 id:"review-"+index,projectId:project.id,reviewerName:index===0?"QA visitor with a long display name ".repeat(2):"QA Visitor "+index,
 rating:index%2?4:5,reviewText:index===0?"Very useful installation. "+"LongReviewWithoutSpaces".repeat(40):"The installation team was helpful and explained the system clearly.",
 createdAt:"2026-09-15T12:00:00Z",
}));
window.fetch=async (input,options)=>{
 const url=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url);
 let data:unknown;
 if(url.pathname.endsWith("/reviews")){
  if(options?.method==="POST"){
   const body=JSON.parse(String(options.body));const review={...body,id:"submitted-"+reviews.length,projectId:project.id,createdAt:new Date().toISOString()};
   reviews.unshift(review);data=review;
  } else {
   const page=Number(url.searchParams.get("page")||1);
   data={reviews:reviews.slice((page-1)*20,page*20),reviewCount:reviews.length,averageRating:reviews.reduce((sum,row)=>sum+row.rating,0)/reviews.length,hasMore:page*20<reviews.length};
  }
 } else data=[project,{...project,id:"22222222-2222-2222-2222-222222222222",title:"QA Legacy Project",completionDate:null,completionYear:2025,isFeaturedHomepage:false}];
 return new Response(JSON.stringify(data),{status:options?.method==="POST"?201:200,headers:{"Content-Type":"application/json"}});
};
function App(){
 const [home,setHome]=useState(false);
 return <><div style={{padding:8,background:"#F5C400",color:"#111111",fontSize:12}}>
 Isolated local QA fixtures <button type="button" onClick={()=>setHome(!home)}>{home?"Projects QA":"Floating CTA QA"}</button>
 </div>{home?<ElectroTechSite/>:<ProjectsDirectory/>}</>;
}
createRoot(document.getElementById("root")!).render(<App/>);

// Keep legacy demo listings as fallback while the live API is unreachable.
export const opportunities = [
 {id:"sch-001",title:"National Scholarship Portal — Post Matric",org:"Government of India",category:"Scholarship",icon:"🏛️",type:"Financial aid",amount:"Varies by scheme",location:"India",deadline:"Check official portal",level:"Undergraduate",description:"Explore post-matric scholarship schemes and verify eligibility, income limits, documents and deadlines on the official portal.",tags:["Scholarship","Government"],url:"https://scholarships.gov.in/",verified:true},
 {id:"sch-002",title:"AICTE Pragati Scholarship",org:"AICTE",category:"Scholarship",icon:"🎓",type:"Education support",amount:"Scheme-dependent",location:"India",deadline:"Verify current cycle",level:"Undergraduate",description:"A scholarship scheme for eligible students. Check the current official notification for criteria, dates and required documents.",tags:["Scholarship","Education"],url:"https://www.aicte-india.org/",verified:false},
 {id:"int-001",title:"Python Backend Developer Intern",org:"Nexora Demo Listing",category:"Internship",icon:"💻",type:"Internship",amount:"Stipend not verified",location:"Remote · India",deadline:"Demo listing",level:"Beginner–Intermediate",description:"A sample listing for building your shortlist. This is demo content, not a verified live vacancy. Replace it with a verified posting before applying.",tags:["Python","FastAPI"],url:"https://www.linkedin.com/jobs/",verified:false},
 {id:"int-002",title:"Data Science Intern",org:"Nexora Demo Listing",category:"Internship",icon:"📊",type:"Internship",amount:"Stipend not verified",location:"Hybrid / Remote",deadline:"Demo listing",level:"Beginner",description:"Sample data-science opportunity card to demonstrate search and saved opportunities. Verify the company, pay and deadline independently.",tags:["Python","ML"],url:"https://internshala.com/",verified:false},
 {id:"hack-001",title:"Open Innovation Hackathon",org:"Community listing",category:"Hackathon",icon:"🚀",type:"Team event",amount:"Prizes vary",location:"India / Online",deadline:"Check organizer",level:"All levels",description:"A sample hackathon listing. Check the organizer's official page for eligibility, schedule, team size and submission rules.",tags:["AI","Open innovation"],url:"https://devpost.com/hackathons",verified:false},
 {id:"learn-001",title:"Machine Learning Learning Path",org:"Learning resource",category:"Course",icon:"🧠",type:"Online learning",amount:"Free to audit",location:"Online",deadline:"Self-paced",level:"Beginner",description:"Build foundational knowledge before applying to ML internships. Review the provider's current access and certificate policies.",tags:["ML","Learning"],url:"https://www.coursera.org/",verified:false},
 {id:"sch-003",title:"State Scholarship Schemes",org:"Official state portals",category:"Scholarship",icon:"📚",type:"Financial aid",amount:"Scheme-dependent",location:"India",deadline:"Depends on state",level:"Undergraduate",description:"State schemes differ by domicile, category, income and course. Confirm eligibility only on the relevant official state portal.",tags:["Scholarship","State"],url:"https://scholarships.gov.in/",verified:false},
 {id:"hack-002",title:"Student Build Weekend",org:"Community listing",category:"Hackathon",icon:"⚡",type:"Build event",amount:"Check organizer",location:"Online",deadline:"Check organizer",level:"Student teams",description:"A sample event card for the Nexora interface. It is not a confirmed upcoming event; use it as a template for real data.",tags:["Students","Projects"],url:"https://devfolio.co/",verified:false}
];

// "Job" and "Fellowship" appear once real scraped data is loaded.
export const categories = [
  "All",
  "Scholarship",
  "Internship",
  "Job",
  "Hackathon",
  "Course",
  "Fellowship",
  "Other",
];

export const getSaved = () => {
  try {
    return JSON.parse(localStorage.getItem("nexora_saved") || "[]");
  } catch {
    return [];
  }
};

export const setSaved = (items) =>
  localStorage.setItem("nexora_saved", JSON.stringify(items));

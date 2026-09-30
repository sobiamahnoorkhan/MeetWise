export interface WeatherContext {available:boolean;summary:string|null;temperatureC?:number;precipitationProbability?:number;source:string;}
export async function getLiveWeather(latitude:number,longitude:number,when:string):Promise<WeatherContext>{
 const date=when.slice(0,10),u=new URL("https://api.open-meteo.com/v1/forecast");
 u.searchParams.set("latitude",String(latitude));u.searchParams.set("longitude",String(longitude));u.searchParams.set("daily","temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code");u.searchParams.set("timezone","auto");u.searchParams.set("start_date",date);u.searchParams.set("end_date",date);
 const r=await fetch(u);if(!r.ok)return{available:false,summary:null,source:"Open-Meteo"};
 const d=await r.json() as any;const max=d.daily?.temperature_2m_max?.[0],min=d.daily?.temperature_2m_min?.[0],rain=d.daily?.precipitation_probability_max?.[0];
 return{available:true,summary:`Temperature ${min??"?"}–${max??"?"}°C; precipitation probability ${rain??"?"}%`,temperatureC:max,precipitationProbability:rain,source:"Open-Meteo"};
}
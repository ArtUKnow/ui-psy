// Real HTTP load with independent authenticated sessions and 32 KiB documents.
package main

import (
 "bytes"
 "crypto/rand"
 "encoding/hex"
 "encoding/json"
 "flag"
 "fmt"
 "io"
 "math"
 "net/http"
 "net/http/cookiejar"
 "os"
 "path/filepath"
 "runtime"
 "sort"
 "strings"
 "sync"
 "time"
)

type user struct {id int;token string;issued time.Time;client *http.Client;version int;seq int;email string;note string}
type result struct{ At string `json:"at"`; User int `json:"user"`; Method string `json:"method"`; Route string `json:"route"`; Status int `json:"status"`; MS float64 `json:"duration_ms"`; ID string `json:"request_id"`; Error string `json:"error,omitempty"`; Measured bool `json:"measured"`}
var lock sync.Mutex
var raw *os.File
var results []result
var base string
func request(u *user,method,path string,body any,measured bool)(map[string]any,error){
 var reader io.Reader;if body!=nil{b,e:=json.Marshal(body);if e!=nil{return nil,e};reader=bytes.NewReader(b)}
 req,e:=http.NewRequest(method,base+path,reader);if e!=nil{return nil,e};req.Header.Set("Content-Type","application/json");if u.token!=""{req.Header.Set("Authorization","Bearer "+u.token)}
 start:=time.Now();res,e:=u.client.Do(req);r:=result{At:start.UTC().Format(time.RFC3339Nano),User:u.id,Method:method,Route:path,Measured:measured};var data map[string]any
 if e!=nil{r.Error=fmt.Sprintf("transport:%T",e)}else{r.Status=res.StatusCode;r.ID=res.Header.Get("X-Request-ID");e=json.NewDecoder(io.LimitReader(res.Body,5<<20)).Decode(&data);res.Body.Close();if e!=nil{r.Error="invalid JSON response"};if res.StatusCode>=400{r.Error=fmt.Sprintf("HTTP %d",res.StatusCode)}}
 r.MS=float64(time.Since(start).Microseconds())/1000
 if r.Error==""&&strings.HasPrefix(path,"/api/data/") {expected,seq:=u.version,u.seq;if method=="PUT"{expected++;seq++};if data["version"]!=float64(expected){r.Error="version mismatch"};items,ok:=data["value"].([]any);if !ok||len(items)!=1{r.Error="invalid document"}else{item,ok:=items[0].(map[string]any);if !ok||item["note"]!=u.note||item["sequence"]!=float64(seq){r.Error="content mismatch"}};if r.Error==""&&method=="PUT"{u.version=expected;u.seq=seq}}
 lock.Lock();_ = json.NewEncoder(raw).Encode(r);if measured{results=append(results,r)};lock.Unlock()
 if r.Error!=""{return data,fmt.Errorf("%s",r.Error)};return data,nil
}
// wall drops the monotonic reading: on macOS it pauses during host sleep while tokens expire by wall time.
func wall()time.Time{return time.Now().Round(0)}
func refresh(u *user)error{data,e:=request(u,"POST","/api/auth/refresh",nil,false);if e==nil{u.token,_=data["accessToken"].(string);u.issued=wall()};return e}
func main(){
 address:=flag.String("url","http://127.0.0.1:8618","isolated Go server");count:=flag.Int("users",500,"active sessions");duration:=flag.Duration("duration",30*time.Minute,"measured interval");warmup:=flag.Duration("warmup",30*time.Second,"warmup interval");period:=flag.Duration("period",5*time.Second,"per-user request period");dir:=flag.String("out","reports/load","evidence output");flag.Parse();base=*address
 if *count<1||*period<=0||*duration<=0{panic("invalid load parameters")};if e:=os.MkdirAll(*dir,0700);e!=nil{panic(e)};var e error;raw,e=os.OpenFile(filepath.Join(*dir,"requests.jsonl"),os.O_CREATE|os.O_EXCL|os.O_WRONLY,0600);if e!=nil{panic(e)};defer raw.Close()
 b:=make([]byte,6);_,e=rand.Read(b);if e!=nil{panic(e)};run:=hex.EncodeToString(b);users:=make([]*user,*count);jobs:=make(chan int);failures:=make(chan error,*count);var setup sync.WaitGroup
 for j:=0;j<8;j++{setup.Add(1);go func(){defer setup.Done();for i:=range jobs{jar,_:=cookiejar.New(nil);u:=&user{id:i,client:&http.Client{Timeout:10*time.Second,Jar:jar,Transport:&http.Transport{MaxIdleConns:2,MaxIdleConnsPerHost:2,IdleConnTimeout:60*time.Second}},email:fmt.Sprintf("load-%s-%d@example.test",run,i),note:strings.Repeat("x",32*1024)};data,e:=request(u,"POST","/api/auth/register",map[string]any{"email":u.email,"password":"synthetic-load-password-2026"},false);if e==nil{u.token,_=data["accessToken"].(string);u.issued=wall();_,e=request(u,"PUT","/api/data/entries",map[string]any{"value":[]any{map[string]any{"id":"entry","note":u.note,"sequence":1}},"version":0},false)};if e!=nil{failures<-e};users[i]=u}}()}
 for i:=range users{jobs<-i};close(jobs);setup.Wait();close(failures);if len(failures)>0{panic(fmt.Sprintf("setup failed for %d users",len(failures)))}
 start:=wall().Add(*warmup);end:=start.Add(*duration);fmt.Printf("Prepared %d real sessions; measured start=%s end=%s\n",*count,start.Format(time.RFC3339),end.Format(time.RFC3339));var wg sync.WaitGroup
 var suspended []string;monoStart,wallStart:=time.Now(),wall();done:=make(chan struct{});go func(){t:=time.NewTicker(time.Second);defer t.Stop();last:=time.Duration(0);for{select{case <-done:return;case <-t.C:drift:=wall().Sub(wallStart)-time.Since(monoStart);if drift-last>2*time.Second{lock.Lock();suspended=append(suspended,fmt.Sprintf("%s +%.0fs",wall().Format(time.RFC3339),(drift-last).Seconds()));lock.Unlock();fmt.Printf("Host suspension detected: %.0fs\n",(drift-last).Seconds())};last=drift}}}()
 for i,u:=range users{wg.Add(1);go func(i int,u *user){defer wg.Done();next:=wall().Add(time.Duration(float64(*period)*float64(i)/float64(*count)));n:=0;for next.Before(end){time.Sleep(time.Until(next));if wall().Sub(u.issued)>12*time.Minute{if e:=refresh(u);e!=nil{fmt.Printf("Refresh failed: user %d\n",i)}};now:=wall();measured:=!now.Before(start)&&now.Before(end);method:="GET";var body any;if n%5==4{method="PUT";body=map[string]any{"value":[]any{map[string]any{"id":"entry","note":u.note,"sequence":u.seq+1}},"version":u.version}};_,_ = request(u,method,"/api/data/entries",body,measured);n++;next=next.Add(*period)}}(i,u)}
 wg.Wait();close(done);sort.Slice(results,func(i,j int)bool{return results[i].MS<results[j].MS});bad:=0;for _,r:=range results{if r.Error!=""{bad++}};p:=func(q float64)float64{if len(results)==0{return 0};i:=int(math.Ceil(float64(len(results))*q))-1;if i<0{i=0};return results[i].MS}
 report:=map[string]any{"run":run,"time_utc":time.Now().UTC().Format(time.RFC3339),"users":*count,"document_note_bytes":32768,"duration_seconds":duration.Seconds(),"warmup_seconds":warmup.Seconds(),"period_seconds":period.Seconds(),"requests":len(results),"failures":bad,"success_percent":100*(1-float64(bad)/float64(len(results))),"rps":float64(len(results))/duration.Seconds(),"p50_ms":p(.5),"p95_ms":p(.95),"p99_ms":p(.99),"max_ms":p(1),"host_suspensions":suspended,"valid":len(suspended)==0,"go":runtime.Version(),"cpu":runtime.NumCPU(),"os":runtime.GOOS,"arch":runtime.GOARCH,"scope":"local synthetic end-to-end HTTP + authentication + Go + PostgreSQL; AI excluded"}
 out,e:=json.MarshalIndent(report,"","  ");if e!=nil{panic(e)};if e=os.WriteFile(filepath.Join(*dir,"summary.json"),out,0600);e!=nil{panic(e)};fmt.Println(string(out));if len(suspended)>0{os.Exit(3)};if bad>0{os.Exit(2)}
}

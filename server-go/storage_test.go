package main

import (
 "os"
 "path/filepath"
 "strings"
 "testing"
)

func TestPgEnvironmentParsesURIWithoutExposingPassword(t *testing.T){
 env,e:=pgEnvironment("postgres://tester:private%40test@localhost:5433/recovery?sslmode=verify-full");if e!=nil{t.Fatal(e)};v:=map[string]string{};for _,s:=range env{k,x,_:=strings.Cut(s,"=");v[k]=x};for k,want:=range map[string]string{"PGDATABASE":"recovery","PGHOST":"localhost","PGPORT":"5433","PGUSER":"tester","PGPASSWORD":"private@test","PGSSLMODE":"verify-full"}{if v[k]!=want{t.Errorf("%s was not decoded correctly",k)}}
 env,e=pgEnvironment("postgres:///recovery?host=/tmp");if e!=nil{t.Fatal(e)};if !strings.Contains(strings.Join(env,"\n"),"PGHOST=/tmp"){t.Fatal("Unix socket host was lost")}
}

func TestPruneBackupsKeepsNewestOwnDumpsOnly(t *testing.T) {
	dir := t.TempDir()
	names := []string{"20261027T120000.000000001.dump", "20261027T120100.000000001.dump", "20261027T120200.000000001.dump", "20261027T120300.000000001.dump.partial", "evidence.dump"}
	for _, name := range names {
		if e := os.WriteFile(filepath.Join(dir, name), nil, 0600); e != nil {
			t.Fatal(e)
		}
	}
	if removed, e := pruneBackups(dir, 0); e != nil || removed != 0 {
		t.Fatalf("keep=0 must keep everything: %d %v", removed, e)
	}
	if removed, e := pruneBackups(dir, 2); e != nil || removed != 1 {
		t.Fatalf("expected one removal: %d %v", removed, e)
	}
	left, _ := os.ReadDir(dir)
	got := []string{}
	for _, entry := range left {
		got = append(got, entry.Name())
	}
	want := []string{"20261027T120100.000000001.dump", "20261027T120200.000000001.dump", "20261027T120300.000000001.dump.partial", "evidence.dump"}
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Fatalf("unexpected files left: %v", got)
	}
}

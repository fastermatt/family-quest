package main

import "testing"

func TestParseRegValue(t *testing.T) {
	out := "\r\nHKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\r\n    EditionID    REG_SZ    Core\r\n    DisplayVersion    REG_SZ    25H2\r\n    ProductName    REG_SZ    Windows 10 Home\r\n    CurrentBuild    REG_SZ    26200\r\n"
	cases := map[string]string{"EditionID": "Core", "DisplayVersion": "25H2", "CurrentBuild": "26200", "ProductName": "Windows 10 Home", "Missing": ""}
	for k, want := range cases {
		if got := parseRegValue(out, k); got != want {
			t.Errorf("%s = %q, want %q", k, got, want)
		}
	}
}

func TestBuildAccounts(t *testing.T) {
	users := `[{"Name":"Grey","Enabled":true,"Source":"Local","SID":"S-1-5-21-1-1001"},{"Name":"matt","Enabled":true,"Source":"MicrosoftAccount","SID":"S-1-5-21-1-1002"},{"Name":"Guest","Enabled":false,"Source":"Local","SID":"S-1-5-21-1-501"}]`
	admins := `["s-1-5-21-1-1002"]`
	got, err := buildAccounts(users, admins)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 3 {
		t.Fatalf("got %d accounts", len(got))
	}
	if got[0].Name != "Grey" || got[0].Type != "local" || got[0].IsAdmin {
		t.Errorf("Grey wrong: %+v", got[0])
	}
	if got[1].Type != "microsoft" || !got[1].IsAdmin {
		t.Errorf("matt wrong: %+v", got[1])
	}
	if got[2].Enabled {
		t.Errorf("Guest should be disabled")
	}
}

func TestBuildAccountsBadInput(t *testing.T) {
	if _, err := buildAccounts("not json", ""); err == nil {
		t.Error("expected error")
	}
	got, err := buildAccounts(`[]`, "")
	if err != nil || len(got) != 0 {
		t.Errorf("empty case: %v %v", got, err)
	}
}

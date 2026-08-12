package files

import "testing"

func TestRelativePathSubtreeSQLUsesLiteralSegmentBoundaries(t *testing.T) {
	service, _, _ := newQuotaTestService(t, 0)
	for _, test := range []struct {
		name      string
		root      string
		candidate string
		want      int
	}{
		{name: "exact", root: "foo", candidate: "foo", want: 1},
		{name: "descendant", root: "foo", candidate: "foo/bar.txt", want: 1},
		{name: "plain prefix", root: "foo", candidate: "foobar/item.txt", want: 0},
		{name: "percent literal", root: "a%", candidate: "abc/item.txt", want: 0},
		{name: "underscore literal", root: "a_", candidate: "a1/item.txt", want: 0},
	} {
		t.Run(test.name, func(t *testing.T) {
			query := `SELECT CASE WHEN ` + relativePathSubtreeSQL + ` THEN 1 ELSE 0 END
  FROM (SELECT ? AS relative_path)`
			args := append(relativePathSubtreeArgs(test.root), test.candidate)
			var got int
			if err := service.db.QueryRow(query, args...).Scan(&got); err != nil {
				t.Fatal(err)
			}
			if got != test.want {
				t.Fatalf("root=%q candidate=%q got=%d want=%d", test.root, test.candidate, got, test.want)
			}
		})
	}
}

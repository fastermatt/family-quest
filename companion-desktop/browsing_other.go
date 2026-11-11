//go:build !windows

package main

import "time"

func collectBrowseHistory() BrowseBatch {
	return BrowseBatch{
		Day: dayOf(time.Now()), Entries: []BrowseEntry{},
		Coverage: BrowseCoverage{
			Status: "unavailable", SupportedBrowsers: []string{"edge", "chrome"},
			ProfilesPerBrowser: maxBrowseProfilesPerBrowser, VisitLimit: maxBrowseVisitsPerDay,
			Browsers: []BrowseBrowserCoverage{{Browser: "edge"}, {Browser: "chrome"}},
		},
	}
}

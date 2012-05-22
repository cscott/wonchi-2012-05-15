#!/usr/bin/perl -w

use strict;

my $inside=0;
my $questions=0;
my $correct=0;
my $wrong=0;
my $correctstreak=0;
my $wrongstreak=0;
my $longestcorrectstreak=1;
my $longestwrongstreak=1;
my $insidecorrectstreak=0;
my $insidewrongstreak=0;
my $percent=0;

while (<>) {
	if (m/START OF NEW QUESTION/) {
		$inside = 1;
		next;
	}
	if ($inside == 1) {
		if (m/ANSWER CORRECT/) {
			$correct++;
			$questions++;
			if ($insidecorrectstreak == 1) {
				$correctstreak++;
			}
			if ($insidewrongstreak == 1) {
				$insidewrongstreak = 0;
				if ($wrongstreak > $longestwrongstreak) {
					$longestwrongstreak = $wrongstreak;
				}
				$wrongstreak = 1;
			}
			$insidecorrectstreak=1;
		}
		elsif (m/ANSWER INCORRECT/) {
			$questions++;
			if ($insidewrongstreak == 1) {
				$wrongstreak++;
			}
			if ($insidecorrectstreak == 1) {
				$insidecorrectstreak = 0;
				if ($correctstreak > $longestcorrectstreak) {
					$longestcorrectstreak = $correctstreak;
				}
				$correctstreak = 1;
			}
			$insidewrongstreak=1;
		}
		$inside = 0;
	}
}

$percent = int($correct/$questions * 100);
print "answered $correct out of $questions questions correctly, which is $percent%, with longest correct streak $longestcorrectstreak and longest wrong streak $longestwrongstreak\n";

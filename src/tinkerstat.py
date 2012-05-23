#!/usr/bin/python

import sys
import os
import traceback
import csv
import argparse
import json
#import matplotlib.pyplot as plt
#from datetime import datetime, date, time
#from dateutil import tz, parser

class tinkerbook_stats:

	def __init__(self):
		# Placeholders for the exposure dictionaries
		self.tinkrwords   = {}
		self.tinkrgraphic = {}
		self.tinkrsound	  = {}

		# The scenes dictionary has tuple of the exposure dictionaries
		# (words,graphics,sounds)
		self.scenes	  = {}
		self.current_scene = 'No Scene'

		# All the output needs to be in the same order so make a list of each exposure value
		# The order in this list is the order of the output
		self.words_header = ['am','Baby','baby','duck.','Tell','Hello,','hello!','anyone','here?','Is']
		self.graphics_header = ['graphic0','graphic2','graphic6 (me,)','graphic0 (I)','graphic4 (duck.)']
		self.sounds_header = ['scene1_duck_stanza', 'scene2_duck_stanza','scene3_duck_stanza']
		self.scene_header = ['intro','scene_1','scene_2','scene_3','scene_4','scene_5','scene_6','scene_7',
					'scene_8','scene_9','scene_10','scene_11','scene_12','scene_13','scene_14',
					'scene_15','scene_16','scene_17','scene_18','scene_18a','scene_19','scene_20',
					'scene_21','scene_22','scene_23','scene_24','scene_25','scene_26','scene_27']
		self.WORDS	= 0
		self.GRAPHIC	= 1
		self.SOUND	= 2

	def change_scene(self,scene_dict):

		# Store the dictionaries for the current scene
		self.scenes[self.current_scene] = (self.tinkrwords,self.tinkrgraphic,self.tinkrsound)

		# Figure out what new scene this is
		scene_val = scene_dict['url']
		scene = scene_val.split('/')[-1]
		scene = scene.split('.')[0]

		if not scene in self.scenes:
			# Create new dictionaries for the exposures if this is a new scene
			self.tinkrwords   = {}
			self.tinkrgraphic = {}
			self.tinkrsound	  = {}
			self.scenes[scene] = (self.tinkrwords,self.tinkrgraphic,self.tinkrsound)
		else:
			# Restore the exposure dictionaries for this scene
			self.tinkrwords,self.tinkrgraphic,self.tinkrsound = self.scenes[scene]
		
		# Set this scene as our new curren scene.
		self.current_scene = scene

	def dict_inc(self,dictname,dictkey):
		if dictkey in dictname:
			value = dictname[dictkey]
			value += 1
			dictname[dictkey] = value
		else:
			dictname[dictkey] = 1
		
	def process_file(self,filename):

		with open(filename,'r') as tfile:
			for line in tfile:
				parts = line.split('\t')
				# existing tinkerbook data has bad json. So we have to fix it
				jfixed = parts[1].replace(':"','":')
				jfixed = jfixed.replace(',}','}')
				jvalues = json.loads(jfixed)

				for k,v in jvalues.iteritems():
					if k == 'TinkrWord':
						# Normalize the word to lowercase and strip the punctuation
						word = v.rstrip('.?!,').lower()
						self.dict_inc(self.tinkrwords,word)
					elif k == 'TinkrGraphic':
						self.dict_inc(self.tinkrgraphic,v)
					elif k == 'SoundPlayed':
						# Just use the last part of the audio file name with no file extension 
						sound = v.split('/')[-1]
						sound = sound.split('.')[0]
						self.dict_inc(self.tinkrsound,sound)
					elif k == 'Scene':
						self.change_scene(v)
					else:	
						print "Unhandled values",k,v

	def process_files(self,filenames):
		for filename in filenames:
			self.process_file(filename)

	def dump_results(self,fd=None):
		fd.write('"scene",')
		# print headers
		for item in self.words_header:
			fd.write( '"%s",' % item )
		for item in self.graphics_header:
			fd.write( '"%s",' % item )
		for item in self.sounds_header:
			fd.write( '"%s",' % item )

		fd.write('\n')

		for scene,v in self.scenes.iteritems():
			fd.write( '"%s",' % scene )
			words,graphics,sounds = v
			for item in self.words_header:
				if item in words:
					fd.write('%d,' % words[item])
				else:
					fd.write('%d,' % 0 )
			for item in self.graphics_header:
				if item in graphics:
					fd.write('%d,' % graphics[item])
				else:
					fd.write('%d,' % 0 )
			for item in self.sounds_header:
				if item in sounds:
					fd.write('%d,' % sounds[item])
				else:
					fd.write('%d,' % 0 )
			fd.write('\n')	
	
			# For debugging and verificaion	
			if True:	
				# Dump all the values to the terminal
				print scene + ":",
				for k,v in words.iteritems():
					print '%s:%d' % (k,v),
				print
				print scene + ":",
				for k,v in graphics.iteritems():
					print '%s:%d' % (k,v),
				print
				print scene + ":",
				for k,v in sounds.iteritems():
					print '%s:%d' % (k,v),
				print

def main():
    parser = argparse.ArgumentParser(description='Process tinkerbook data')
    parser.add_argument('filenames', nargs='+', help='files to process')
    parser.add_argument('-o','--output', help='output filename')

    args = parser.parse_args()

    if args.output == None:
	print "No output filename"
	os.sys.exit(1)

    tbstat = tinkerbook_stats()

    if len(args.filenames) != 0:
	tbstat.process_files(args.filenames)
    else:
	print "No files found to process"

    with open(args.output,'w') as fd:
	    tbstat.dump_results(fd)


if __name__ == '__main__':
    main()

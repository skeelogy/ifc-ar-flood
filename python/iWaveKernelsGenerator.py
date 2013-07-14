"""
@author: Skeel Lee
@contact: skeel@skeelogy.com
@since: 12 Jul 2013

Python script to generate the kernels in Tessendorf's iWave algorithm.

Usage: python iWaveKernelsGenerator <kernelRadius>
e.g. python iWaveKernelsGenerator 6
A JSON file which contains the kernel data will be created in the same directory.

Tested with Python 2.7.3 only.

You need to install scipy for the script to work (need to evaluate the Bessel J0 function).
"""

import sys
import math
import json

from scipy.special import jn

class IWaveKernelsGenerator(object):

	def __init__(self):
		self.deltaQ = 0.001
		self.sigma = 1
		self.nMax = 10000

		self.g0 = self.__calculateG0()

	def __calculateG0(self):
		g0 = 0
		for n in range(1, self.nMax+1):
			qn = n * self.deltaQ
			qnSquared = qn * qn
			g0 += qnSquared * math.exp(-self.sigma * qnSquared)
		return g0

	def generate(self, kernelRadius, outputFile):

		results = {}

		#compute kernel values
		for k in range(0, kernelRadius+1):
			results[k] = {}
			for l in range(k+1, kernelRadius+1):
				results[k][l] = 0
				r = math.sqrt(k*k+l*l)
				for n in range(1, self.nMax+1):
					qn = n * self.deltaQ
					qnSquared = qn * qn
					results[k][l] += qnSquared * math.exp(-self.sigma * qnSquared) * jn(0, qn*r)
				results[k][l] /= self.g0
		
		#write to file as json
		with open(outputFile, 'w') as f:
			json.dump(results, f, indent=True)

if __name__ == '__main__':

	if len(sys.argv) < 2:
		sys.stderr.write('ERROR: Kernel radius not specified.\nPlease specify kernel radius as an argument.\n')
		sys.exit(-1)

	kernelRadius = int(sys.argv[1])
	outputFile = 'iWave_kernels_%d.json' % kernelRadius

	g = IWaveKernelsGenerator()
	g.generate(kernelRadius, outputFile)
//@author: Skeel Lee
//@contact: skeel@skeelogy.com
//@since: 11 July 2013
//2D height-field water simulation

function HeightFieldWaterSim(mesh, size, res, dampingFactor)
{
	this.mesh = mesh;
	this.size = size;
	this.res = res;
	this.dampingFactor = dampingFactor;

	this.geometry = this.mesh.geometry;
	this.numVertices = res * res;
	if (this.numVertices !== this.geometry.vertices.length)
	{
		throw new Error('Number of vertices in mesh does not match res*res');
	}
	this.segmentSize = this.size / this.res;
	this.segmentSizeSquared = this.segmentSize * this.segmentSize;

	this.velocityField = [];
	this.sourceField = [];
	this.obstacleField = [];

	this.init();
}

HeightFieldWaterSim.prototype.init = function()
{
	//init fields first
	var i;
	for (i = 0; i < this.numVertices; i++)
	{
		this.velocityField[i] = 0;
		this.sourceField[i] = 0;
		this.obstacleField[i] = 0;
	}

	//update mesh
	this.__updateMesh();
}

HeightFieldWaterSim.prototype.update = function(dt)
{
	this.sim(dt);
	this.__clearFields();
}

HeightFieldWaterSim.prototype.sim = function(dt)
{
	throw new Error('Abstract method not implemented');
}

HeightFieldWaterSim.prototype.disturb = function(idx, amount)
{
	this.sourceField[idx] += amount;
}

HeightFieldWaterSim.prototype.__clearFields = function()
{
	var i;
	for (i = 0; i < this.numVertices; i++)
	{
		this.sourceField[i] = 0;
		this.obstacleField[i] = 0;
	}
}

HeightFieldWaterSim.prototype.__updateMesh = function()
{
	this.geometry.verticesNeedUpdate = true;
	this.geometry.computeFaceNormals();  //must call this first before computeVertexNormals()
	this.geometry.computeVertexNormals();
	this.geometry.normalsNeedUpdate = true;
}



function HeightFieldWaterSim_Muller_GDC2008(mesh, size, res, dampingFactor, horizontalSpeed)
{
	HeightFieldWaterSim.call(this, mesh, size, res, dampingFactor);

	this.horizontalSpeed = horizontalSpeed;
	this.horizontalSpeedSquared = this.horizontalSpeed * this.horizontalSpeed;
}
//inherit from HeightFieldWaterSim
HeightFieldWaterSim_Muller_GDC2008.prototype = Object.create(HeightFieldWaterSim.prototype);
HeightFieldWaterSim_Muller_GDC2008.prototype.constructor = HeightFieldWaterSim_Muller_GDC2008;
//override
HeightFieldWaterSim_Muller_GDC2008.prototype.sim = function(dt)
{
	var i, j, idx;
	var v = this.geometry.vertices;

	//add source field first
	for (i = 1; i < this.res-1; i++)
	{
		for (j = 1; j < this.res-1; j++)
		{
			idx = i * this.res + j;
			v[idx].y += this.sourceField[idx];
		}
	}

	//calculate vertical acceleration and velocity
	var acc;
	for (i = 1; i < this.res-1; i++)
	{
		for (j = 1; j < this.res-1; j++)
		{
			idx = i * this.res + j;
			acc = this.horizontalSpeedSquared * (
				v[idx+this.res].y    //height[i+1,j]
				+ v[idx-this.res].y  //height[i-1,j]
				+ v[idx+1].y         //height[i,j+1]
				+ v[idx-1].y         //height[i,j-1]
				- 4 * v[idx].y       //4 * height[i,j]
				) / this.segmentSizeSquared;
			this.velocityField[idx] += acc * dt;
			this.velocityField[idx] *= this.dampingFactor;
		}
	}

	//update vertex heights
	var len = v.length;
	for (i = 0; i < len; i++)
	{
		v[i].y += this.velocityField[i] * dt;
	}

	//update mesh
	this.__updateMesh();
}
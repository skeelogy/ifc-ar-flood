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
	this.staticObstacleField = [];

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
		this.staticObstacleField[i] = 1;
	}

	// //init with some interesting shape
	// var v = this.geometry.vertices;
	// var len = v.length;
	// for (i = 0; i < len; i++)
	// {
	// 	v[i].y = Math.sin(v[i].x);
	// }

	// //update mesh
	// this.__updateMesh();
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

HeightFieldWaterSim.prototype.block = function(idx, amount)
{
	this.staticObstacleField[idx] = amount;
}

// HeightFieldWaterSim.prototype.addObstacle = function(type, mesh)
// {
// 	//TODO: rasterize the mesh onto the current water plane state
// 	//this.staticObstacleField[idx] = amount;
// }

HeightFieldWaterSim.prototype.__clearFields = function()
{
	var i;
	for (i = 0; i < this.numVertices; i++)
	{
		this.sourceField[i] = 0;
		this.staticObstacleField[i] = 1;
	}
}

HeightFieldWaterSim.prototype.__updateMesh = function()
{
	this.geometry.verticesNeedUpdate = true;
	this.geometry.computeFaceNormals();  //must call this first before computeVertexNormals()
	this.geometry.computeVertexNormals();
	this.geometry.normalsNeedUpdate = true;
}

//HelloWorld code from: Matthias Muller-Fisher, "Fast Water Simulation for Games Using Height Fields", GDC2008
function HeightFieldWaterSim_Muller_GDC2008_HelloWorld(mesh, size, res, dampingFactor)
{
	HeightFieldWaterSim.call(this, mesh, size, res, dampingFactor);
}
//inherit from HeightFieldWaterSim
HeightFieldWaterSim_Muller_GDC2008_HelloWorld.prototype = Object.create(HeightFieldWaterSim.prototype);
HeightFieldWaterSim_Muller_GDC2008_HelloWorld.prototype.constructor = HeightFieldWaterSim_Muller_GDC2008_HelloWorld;
//override
HeightFieldWaterSim_Muller_GDC2008_HelloWorld.prototype.sim = function(dt)
{
	var i, j, idx;
	var v = this.geometry.vertices;
	var resMinusOne = this.res - 1;

	//apply source and obstacles first
	for (i = 1; i < resMinusOne; i++)
	{
		for (j = 1; j < resMinusOne; j++)
		{
			idx = i * this.res + j;
			v[idx].y += this.sourceField[idx];
			v[idx].y *= this.staticObstacleField[idx];
		}
	}

	//apply algo
	for (i = 1; i < resMinusOne; i++)
	{
		for (j = 1; j < resMinusOne; j++)
		{
			idx = i * this.res + j;
			this.velocityField[idx] += (v[(i-1)*this.res+j].y + v[(i+1)*this.res+j].y + v[i*this.res+(j-1)].y + v[i*this.res+(j+1)].y) / 4.0 - v[idx].y;
			this.velocityField[idx] *= this.dampingFactor;
		}
	}

	//update vertex heights
	for (i = 1; i < resMinusOne; i++)
	{
		for (j = 1; j < resMinusOne; j++)
		{
			idx = i * this.res + j;
			v[idx].y += this.velocityField[idx];
		}
	}

	//update mesh
	this.__updateMesh();
}

//Matthias Muller-Fisher, "Fast Water Simulation for Games Using Height Fields", GDC2008
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
	var resMinusOne = this.res - 1;

	//add source and obstacles first
	for (i = 1; i < resMinusOne; i++)
	{
		for (j = 1; j < resMinusOne; j++)
		{
			idx = i * this.res + j;
			v[idx].y += this.sourceField[idx];
			v[idx].y *= this.staticObstacleField[idx];
		}
	}

	//calculate vertical acceleration and velocity
	var acc;
	for (i = 1; i < resMinusOne; i++)
	{
		for (j = 1; j < resMinusOne; j++)
		{
			idx = i * this.res + j;
			acc = this.horizontalSpeedSquared * (
				v[idx+this.res].y    //height[i+1,j]
				+ v[idx-this.res].y  //height[i-1,j]
				+ v[idx+1].y         //height[i,j+1]
				+ v[idx-1].y         //height[i,j-1]
				- 4 * v[idx].y       //4 * height[i,j]
				) / this.segmentSizeSquared;
			this.velocityField[idx] += acc * dt;  //TODO: use a better integrator
			this.velocityField[idx] *= this.dampingFactor;
		}
	}

	//update vertex heights
	var len = v.length;
	for (i = 1; i < resMinusOne; i++)
	{
		for (j = 1; j < resMinusOne; j++)
		{
			idx = i * this.res + j;
			v[idx].y += this.velocityField[idx] * dt;  //TODO: use a better integrator
		}
	}

	//update mesh
	this.__updateMesh();
}

//http://freespace.virgin.net/hugo.elias/graphics/x_water.htm
function HeightFieldWaterSim_xWater(mesh, size, res, dampingFactor)
{
	this.field1 = [];
	this.field2 = [];

	HeightFieldWaterSim.call(this, mesh, size, res, dampingFactor);
}
//inherit from HeightFieldWaterSim
HeightFieldWaterSim_xWater.prototype = Object.create(HeightFieldWaterSim.prototype);
HeightFieldWaterSim_xWater.prototype.constructor = HeightFieldWaterSim_xWater;
//override
HeightFieldWaterSim_xWater.prototype.init = function()
{
	//init fields first
	var i;
	for (i = 0; i < this.numVertices; i++)
	{
		this.field1[i] = 0;
		this.field2[i] = 0;
	}

	//call super class init to initialize other fields
	HeightFieldWaterSim.prototype.init.call(this);
}
HeightFieldWaterSim.prototype.sim = function(dt)
{
	var i, j, idx;
	var v = this.geometry.vertices;
	var resMinusOne = this.res - 1;

	//add source and obstacles first
	for (i = 1; i < resMinusOne; i++)
	{
		for (j = 1; j < resMinusOne; j++)
		{
			idx = i * this.res + j;
			this.field1[idx] += this.sourceField[idx];
			this.field1[idx] *= this.staticObstacleField[idx];
		}
	}

	//apply algo
	for (i = 1; i < resMinusOne; i++)
	{
		for (j = 1; j < resMinusOne; j++)
		{
			idx = i * this.res + j;
			this.field2[idx] = (this.field1[(i-1)*this.res+j] + this.field1[(i+1)*this.res+j] + this.field1[i*this.res+(j-1)] + this.field1[i*this.res+(j+1)]) / 2.0 - this.field2[idx];
			this.field2[idx] *= this.dampingFactor;
		}
	}

	//update vertex heights
	for (i = 1; i < resMinusOne; i++)
	{
		for (j = 1; j < resMinusOne; j++)
		{
			idx = i * this.res + j;
			v[idx].y = this.field2[idx];
		}
	}

	//update mesh
	this.__updateMesh();

	//swap buffers
	var temp;
	for (i = 1; i < resMinusOne; i++)
	{
		for (j = 1; j < resMinusOne; j++)
		{
			idx = i * this.res + j;
			temp = this.field2[idx];
			this.field2[idx] = this.field1[idx];
			this.field1[idx] = temp;
		}
	}
}
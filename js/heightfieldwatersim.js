//@author: Skeel Lee
//@contact: skeel@skeelogy.com
//@since: 11 July 2013
//2D height-field water simulation

function HeightFieldWaterSim(mesh, size, res)
{
	this.mesh = mesh;
	this.size = size;
	this.res = res;

	this.dampingFactor = 0.99;

	this.geometry = this.mesh.geometry;
	this.numVertices = res * res;

	this.velocityField = [];
	this.sourceField = [];
	this.obstacleField = [];

	this.init();
}

HeightFieldWaterSim.prototype.init = function()
{
	//init the arrays
	var i;
	for (i = 0; i < this.numVertices; i++)
	{
		this.velocityField[i] = 0;
		this.sourceField[i] = 0;
		this.obstacleField[i] = 0;
	}

	//init with some interesting shape
	var v = this.mesh.geometry.vertices;
	var len = v.length;
	for (i = 0; i < len; i++)
	{
		v[i].y = Math.sin(v[i].x);
	}

	//update mesh
	this.__updateMesh();
}

HeightFieldWaterSim.prototype.update = function(dt)
{
	this.sim(dt);
}

HeightFieldWaterSim.prototype.sim = function(dt)
{
	var i, j, idx;
	var v = this.mesh.geometry.vertices;
	for (i = 1; i < this.res-1; i++)
	{
		for (j = 1; j < this.res-1; j++)
		{
			idx = i * this.res + j;
			this.velocityField[idx] += (v[(i-1)*this.res+j].y + v[(i+1)*this.res+j].y + v[i*this.res+(j-1)].y + v[i*this.res+(j+1)].y) / 4.0 - v[idx].y;
			this.velocityField[idx] *= this.dampingFactor;
		}
	}

	//update vertex heights
	var len = v.length;
	for (i = 0; i < len; i++)
	{
		v[i].y += this.velocityField[i];
	}

	//update mesh
	this.__updateMesh();
}

HeightFieldWaterSim.prototype.__updateMesh = function()
{
	this.geometry.verticesNeedUpdate = true;
	this.geometry.computeFaceNormals();  //must call this first before computeVertexNormals()
	this.geometry.computeVertexNormals();
	this.geometry.normalsNeedUpdate = true;
}
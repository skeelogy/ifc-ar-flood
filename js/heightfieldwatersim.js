//@author: Skeel Lee
//@contact: skeel@skeelogy.com
//@since: 11 July 2013
//2D height-field water simulation

//===================================
// HEIGHT FIELD WATER SIMS
//===================================

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

	this.obstacleManager = new ObstacleManager(this.size, this.res, -2, 2);
	this.obstaclesActive = true;
	//FIXME: remove these hardcoded values
	this.clampMin = 0.48;
	this.clampMax = 0.68;

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
		this.obstacleField[i] = 1;
	}
}

HeightFieldWaterSim.prototype.update = function(dt)
{
	this.obstacleManager.update();

	//update obstacle field using the depth map
	if (this.obstaclesActive)
	{
		var obstacleDepthMapData = this.obstacleManager.getObstacleDepthMap();
		var i;
		var length = this.res * this.res;
		var norm;
		for (i = 0; i < length; i++)
		{
			norm = obstacleDepthMapData[i*4] / 255.0;
			this.obstacleField[i] = 1 - (norm >= this.clampMin && norm <= this.clampMax);
		}
	}

	this.sim(dt);
	this.__clearFields();
}

HeightFieldWaterSim.prototype.sim = function(dt)
{
	throw new Error('Abstract method not implemented');
}

HeightFieldWaterSim.prototype.disturb = function(idx, amount)
{
	this.sourceField[idx] = amount;
}

HeightFieldWaterSim.prototype.addObstacle = function(mesh)
{
	this.obstacleManager.addObstacle(mesh);
}

HeightFieldWaterSim.prototype.setObstaclesActive = function(isActive)
{
	this.obstaclesActive = isActive;
}

HeightFieldWaterSim.prototype.reset = function()
{
	//set mesh back to 0
	var i;
	var v = this.geometry.vertices;
	for (i = 0; i < this.numVertices; i++)
	{
		v[i].y = 0;
	}

	//clear fields
	this.__clearFields();
}

HeightFieldWaterSim.prototype.__clearFields = function()
{
	var i;
	for (i = 0; i < this.numVertices; i++)
	{
		this.sourceField[i] = 0;
		this.obstacleField[i] = 1;
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
			v[idx].y *= this.obstacleField[idx];
		}
	}

	//propagate
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
	//fixing dt: better to be in slow motion than to explode
	dt = 1.0 / 60.0; 

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
			v[idx].y *= this.obstacleField[idx];
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
HeightFieldWaterSim_xWater.prototype.reset = function()
{
	var i;
	for (i = 0; i < this.numVertices; i++)
	{
		this.field1[i] = 0;
		this.field2[i] = 0;
	}

	HeightFieldWaterSim.prototype.reset.call(this);
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
			this.field1[idx] *= this.obstacleField[idx];
		}
	}

	//propagate
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

//Jerry Tessendorf, "Interactive Water Surfaces", Game Programming Gems 4
function HeightFieldWaterSim_Tessendorf_iWave(mesh, size, res, dampingFactor, kernelRadius)
{
	this.prevHeight = [];
	this.vertDeriv = [];

	HeightFieldWaterSim.call(this, mesh, size, res, dampingFactor);

	this.kernelRadius = kernelRadius;

	this.gravity = -9.81;

	//load this.G from json file
	var that = this;
	$.getJSON('/python/iWave_kernels_'+this.kernelRadius+'.json', function(data){
		that.G = data;
	});
}
//inherit from HeightFieldWaterSim
HeightFieldWaterSim_Tessendorf_iWave.prototype = Object.create(HeightFieldWaterSim.prototype);
HeightFieldWaterSim_Tessendorf_iWave.prototype.constructor = HeightFieldWaterSim_Tessendorf_iWave;
//override
HeightFieldWaterSim_Tessendorf_iWave.prototype.init = function()
{
	console.log('iwave init');
	//init fields first
	var i;
	for (i = 0; i < this.numVertices; i++)
	{
		this.prevHeight[i] = 0;
		this.vertDeriv[i] = 0;
	}

	//call super class init to initialize other fields
	HeightFieldWaterSim.prototype.init.call(this);
}
HeightFieldWaterSim_Tessendorf_iWave.prototype.reset = function()
{
	var i;
	for (i = 0; i < this.numVertices; i++)
	{
		this.prevHeight[i] = 0;
		this.vertDeriv[i] = 0;
	}

	HeightFieldWaterSim.prototype.reset.call(this);
}
HeightFieldWaterSim_Tessendorf_iWave.prototype.sim = function(dt)
{
	//fixing dt: better to be in slow motion than to explode
	dt = 1.0 / 60.0; 

	//TODO: start using events, rather than having this check on every frame
	if (!this.G)
	{
		return;
	}
	
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
			v[idx].y *= this.obstacleField[idx];
		}
	}

	//convolve to update this.vertDeriv
	this.__symmetricalConvolve();

	//propagate
	var temp;
	var twoMinusDampTimesDt = 2.0 - this.dampingFactor * dt;
	var onePlusDampTimesDt = 1.0 + this.dampingFactor * dt;
	var gravityTimesDtTimesDt = this.gravity * dt * dt;
	for (i = 1; i < resMinusOne; i++)
	{
		for (j = 1; j < resMinusOne; j++)
		{
			idx = i * this.res + j;
			temp = v[idx].y;
			v[idx].y = (v[idx].y * twoMinusDampTimesDt
						- this.prevHeight[idx]
						- this.vertDeriv[idx] * gravityTimesDtTimesDt) / onePlusDampTimesDt;
			this.prevHeight[idx] = temp;
		}
	}

	//update mesh
	this.__updateMesh();
}
//methods
HeightFieldWaterSim_Tessendorf_iWave.prototype.__symmetricalConvolve = function()
{
	var i, j, k, l;
	var v = this.geometry.vertices;
	for (i = this.kernelRadius; i < this.res - this.kernelRadius; i++)
	{
		for (j = this.kernelRadius; j < this.res - this.kernelRadius; j++)
		{
			idx = i * this.res + j;

			//convolve for every pair of [i,j]

			//NOTE: symmetrical convolution forumla in article does not seem to work.
			//I'm doing it the following way to cover all positions of the kernel:

			//add [0,0] first
			this.vertDeriv[idx] = v[idx].y;

			//when k = 0, swap k and l in a specific manner while changing signs
			k = 0;
			for (l = 1; l <= this.kernelRadius; l++)  //article says to start from k+1, but I think it should start from 1 instead
			{
				this.vertDeriv[idx] += this.G[k][l] * ( v[(i+k)*this.res+(j+l)].y + v[(i+k)*this.res+(j-l)].y + v[(i+l)*this.res+(j+k)].y + v[(i-l)*this.res+(j+k)].y );
			}

			//for k larger than 0, k and l do not swap at all, only change signs
			for (k = 1; k <= this.kernelRadius; k++)
			{
				for (l = 1; l <= this.kernelRadius; l++)  //article says to start from k+1, but I think it should start from 1 instead
				{
					this.vertDeriv[idx] += this.G[k][l] * ( v[(i+k)*this.res+(j+l)].y + v[(i-k)*this.res+(j-l)].y + v[(i+k)*this.res+(j-l)].y + v[(i-k)*this.res+(j+l)].y );
				}
			}

		}
	}
}
HeightFieldWaterSim_Tessendorf_iWave.prototype.__convolve = function()
{
	//NOTE: this is not used. I left it here for debugging if necessary.
	var i, j, k, l;
	var v = this.geometry.vertices;
	for (i = this.kernelRadius; i < this.res - this.kernelRadius; i++)
	{
		for (j = this.kernelRadius; j < this.res - this.kernelRadius; j++)
		{
			idx = i * this.res + j;

			//convolve for every pair of [i,j]
			this.vertDeriv[idx] = 0;
			for (k = -this.kernelRadius; k <= this.kernelRadius; k++)
			{
				for (l = -this.kernelRadius; l <= this.kernelRadius; l++)
				{
					this.vertDeriv[idx] += this.G[k][l] * v[(i+k)*this.res+(j+l)].y;
				}
			}

		}
	}
}

//===================================
// OBSTACLES
//===================================

function ObstacleManager(depthMapSize, depthMapRes, depthMapNear, depthMapFar)
{
	this.depthMapSize = depthMapSize;
	this.depthMapRes = depthMapRes;
	this.depthMapNear = depthMapNear;
	this.depthMapFar = depthMapFar;

	this.init();
}
ObstacleManager.prototype.init =  function()
{
	this.__loadScene();
	this.__prepareDepthMapImageElements();
}

ObstacleManager.prototype.update =  function()
{
	this.depthMapRenderer.autoClear = false;
	this.depthMapRenderer.clear();
	this.depthMapRenderer.render(this.depthMapScene, this.depthMapCamera);

	//update obstacle depth map image display
	this.$depthMapImageObj[0].src = this.depthMapRenderer.domElement.toDataURL();
}

ObstacleManager.prototype.addObstacle = function(mesh)
{
	//create another mesh with the same geometry, but with a MeshDepthMaterial
	var depthMesh = new THREE.Mesh(
		mesh.geometry,
		new THREE.MeshDepthMaterial({side:THREE.DoubleSide, overdraw:true})
	);

	//do a reference copy of position, rotation and scale, so that will auto-update
	//TODO: not sure why cannot just get matrix from mesh and apply to depthMesh
	depthMesh.position = mesh.position;
	depthMesh.rotation = mesh.rotation;
	depthMesh.scale = mesh.scale;

	this.depthMapScene.add(depthMesh);
}

ObstacleManager.prototype.getObstacleDepthMap = function()
{
	return this.obstacleDepthMapCanvasElemContext.getImageData(0, 0, this.depthMapRes, this.depthMapRes).data;
}

ObstacleManager.prototype.__loadScene = function()
{
	//init objects for depth map rendering
	this.depthMapRenderer = new THREE.CanvasRenderer({
		antialias : true
	});
	this.depthMapRenderer.setSize(this.depthMapRes, this.depthMapRes);
	this.depthMapRenderer.setClearColor('#000000', 1);
	this.obstacleDepthMapCanvasElemContext = this.depthMapRenderer.domElement.getContext('2d');

	this.depthMapScene = new THREE.Scene();

	var halfSize = this.depthMapSize / 2.0;
	this.depthMapCamera = new THREE.OrthographicCamera(-halfSize, halfSize, -halfSize, halfSize, this.depthMapNear, this.depthMapFar);
	this.depthMapCamera.rotation.x = THREE.Math.degToRad(90);
	this.depthMapCamera.position.y = 0;
}

ObstacleManager.prototype.__prepareDepthMapImageElements = function()
{
	//load original terrain image, scale it using canvas, then set scaled image to $scaledImageObj
	this.$depthMapImageObj = $(new Image());
	this.$depthMapImageObj[0].src = this.depthMapRenderer.domElement.toDataURL();
	$('body').append(this.$depthMapImageObj);
}
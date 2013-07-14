//@author: Skeel Lee
//@contact: skeel@skeelogy.com
//@since: 11 July 2013
//2D height-field water simulation

HeightFieldWaterSim.obstacleType = {
	STATIC: 0,
	DYNAMIC: 1
};
Object.freeze(HeightFieldWaterSim.obstacleType);

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

	//init objects for depth map rendering
	this.depthRttRenderer = new THREE.CanvasRenderer({
		antialias : true
	});
	this.depthRttRenderer.setSize(this.res, this.res);
	this.depthRttRenderer.setClearColor('#000000', 1);
	var $container = $('#threejs-container');
	$container.append(this.depthRttRenderer.domElement);
	this.obstacleDepthMapCanvasElemContext = this.depthRttRenderer.domElement.getContext('2d');

	this.depthRttScene = new THREE.Scene();

	var halfSize = this.size / 2;
	this.depthRttCamera = new THREE.OrthographicCamera(-halfSize, halfSize, -halfSize, halfSize, -2, 2);
	this.depthRttCamera.rotation.x = THREE.Math.degToRad(90);
	this.depthRttCamera.position.y = 0;

	this.prepareTerrainImageElements();
}

HeightFieldWaterSim.prototype.prepareTerrainImageElements = function()
{
	// //create canvas that is same size as terrain res so that one vertex maps to one resized pixel
	// $imageCanvasElem = $(document.createElement('canvas'));
	// $imageCanvasElem[0].id = 'obstaclesDepthMapCanvas';
	// $imageCanvasElem[0].width = this.res;
	// $imageCanvasElem[0].height = this.res;
	// $imageCanvasElem.css({'position':'fixed', 'top':'55px', 'left':0});
	// $('body').append($imageCanvasElem);
	
	// //get canvas context
 //    this.obstacleDepthMapCanvasElemContext = $imageCanvasElem[0].getContext('2d');

	// //load terrain image
	// $scaledImageObj = $(new Image());
	// $scaledImageObj[0].id = 'scaledTerrainImage';
	// $scaledImageObj[0].onload = function()
	// {
	// 	//this function is triggered from $origImageObj setting this src
		
	// 	//start filtering and changing heights
	// 	// filterTerrainImageAndGenerateHeight();
	// };
	// $scaledImageObj.css({'display':'none'});
	// $('body').append($scaledImageObj);

	//load original terrain image, scale it using canvas, then set scaled image to $scaledImageObj
	this.$origImageObj = $(new Image());
	this.$origImageObj[0].onload = function()
	{
		//copy to scaled canvas to scale this image
		// imageCanvasElemContext.drawImage($origImageObj[0], 0, 0, TERRAIN_RES, TERRAIN_RES);

		//get scaled data from canvas and set data for scaledImageObj
		// $scaledImageObj[0].src = $imageCanvasElem[0].toDataURL();
		// console.log('done');
	};
	this.$origImageObj[0].src = this.depthRttRenderer.domElement.toDataURL();
	$('body').append(this.$origImageObj);
}

HeightFieldWaterSim.prototype.update = function(dt)
{
	this.depthRttRenderer.autoClear = false;
	this.depthRttRenderer.clear();
	this.depthRttRenderer.render(this.depthRttScene, this.depthRttCamera);

	this.sim(dt);
	this.__clearFields();

	//update obstacle depth map
	this.$origImageObj[0].src = this.depthRttRenderer.domElement.toDataURL();
	
	//update obstacle field
	this.obstacleDepthMapData = this.obstacleDepthMapCanvasElemContext.getImageData(0, 0, this.res, this.res).data;
	var i;
	var length = this.res * this.res;
	for (i = 0; i < length; i++)
	{	
		var clampMin = 0.48;
		var clampMax = 0.68;
		var norm = this.obstacleDepthMapData[i*4] / 255.0;
		this.staticObstacleField[i] = 1 - (norm >= clampMin && norm <= clampMax);
	}
}

HeightFieldWaterSim.prototype.sim = function(dt)
{
	throw new Error('Abstract method not implemented');
}

HeightFieldWaterSim.prototype.disturb = function(idx, amount)
{
	this.sourceField[idx] = amount;
}

// HeightFieldWaterSim.prototype.block = function(idx, amount)
// {
// 	this.staticObstacleField[idx] = amount;
// }

HeightFieldWaterSim.prototype.addObstacle = function(type, mesh)
{
	//TODO: rasterize the mesh onto the current water plane state
	if (type === HeightFieldWaterSim.obstacleType.STATIC)
	{
		var depthMesh = new THREE.Mesh(
			mesh.geometry,
			new THREE.MeshDepthMaterial({side:THREE.DoubleSide, overdraw:true})
		);

		//TODO: not sure why cannot just get matrix from mesh and apply

		//do a reference copy of position, rotation and scale, so that will auto-update
		depthMesh.position = mesh.position;
		depthMesh.rotation = mesh.rotation;
		depthMesh.scale = mesh.scale;

		this.depthRttScene.add(depthMesh);
	}
	else if (type === HeightFieldWaterSim.obstacleType.DYNAMIC)
	{
		
	}
	else
	{
		throw new Error('Unrecognised obstacle type: ' + type);
	}
}

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
			v[idx].y *= this.staticObstacleField[idx];
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
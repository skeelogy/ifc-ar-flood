/*===================================
skvoxelizer.js
@author: Skeel Lee
@contact: skeel@skeelogy.com
@since: 19 Jul 2013
A voxelizer for Three.js meshes
===================================*/

function SkVoxelizer(mesh, voxelSizeX, voxelSizeY, voxelSizeZ)
{
	this.mesh = mesh;
	this.voxelSizeX = voxelSizeX || 1;
	this.voxelSizeY = voxelSizeY || 1;
	this.voxelSizeZ = voxelSizeZ || 1;

	this.__EPSILON = 0.001;

	this.geometry = mesh.geometry;
	this.mesh.material.side = THREE.DoubleSide;  //make sure that the material is double sided for intersection test to work properly

	this.voxelData = {};
	this.intersectionFirstAndLastHeights = {};

	//if bounding box does not exist, force generate it first
	if (!this.geometry.boundingBox) this.geometry.computeBoundingBox();
	//store some private variables for calculations later
	this.bbox = this.geometry.boundingBox;
	this.__min = new THREE.Vector3();
	this.__max = new THREE.Vector3();
	this.__transformedBbox = this.bbox.clone();
	this.__xMinMultiple = 0;
	this.__xMaxMultiple = 0;
	this.__yMinMultiple = 0;
	this.__yMaxMultiple = 0;
	this.__zMinMultiple = 0;
	this.__zMaxMultiple = 0;

	//store some private variables for intersection test
	this.__voxelMeshes = {};
	this.__raycaster = new THREE.Raycaster();
	// this.__raycaster.precision = 0.1;
	this.__startPoint = new THREE.Vector3(0, -99999, 0);
	this.__up = new THREE.Vector3(0, 1, 0);

	//store some private variables for voxel mesh generation
	this.__voxelGeom = new THREE.CubeGeometry(this.voxelSizeX, this.voxelSizeY, this.voxelSizeZ);
	this.__voxelMaterial = new THREE.MeshPhongMaterial();
}

SkVoxelizer.prototype.__updateMinMax = function()
{
	//get current world transform matrix of mesh
	var worldMat = this.mesh.matrixWorld;

	//transform bounding box
	var transformedAabb = this.__transformedBbox.copy(this.bbox).applyMatrix4(worldMat);
	this.__min = transformedAabb.min;
	this.__max = transformedAabb.max;

	//update the min/max multiples
	this.__xMinMultiple = Math.ceil(this.__min.x / this.voxelSizeX) * this.voxelSizeX;
	this.__xMaxMultiple = Math.floor(this.__max.x / this.voxelSizeX) * this.voxelSizeX;
	this.__yMinMultiple = Math.ceil(this.__min.y / this.voxelSizeY) * this.voxelSizeY;
	this.__yMaxMultiple = Math.floor(this.__max.y / this.voxelSizeY) * this.voxelSizeY;
	this.__zMinMultiple = Math.ceil(this.__min.z / this.voxelSizeZ) * this.voxelSizeZ;
	this.__zMaxMultiple = Math.floor(this.__max.z / this.voxelSizeZ) * this.voxelSizeZ;
}

SkVoxelizer.prototype.updateIntersections = function()
{
	//cast rays from bottom up and keep list of first and last intersections
	//based on ray stabbing method from "Simplification and Repair of Polygonal Models Using Volumetric Techniques", F. S. Nooruddin and G. Turk

	//NOTE: this assumes that the mesh is well-defined (water-tight, no self-intersections etc),
	//so I'm not doing multiple projections as suggested in the paper to handle difficult cases yet.

	//TODO: implement parity check method so that it works on more complex shapes such as a torus knot

	//get min and max of bounding box in world space
	this.__updateMinMax();

	//cast ray upwards from each (x,z) point and detect intersection with mesh
	// Math.seedrandom(1);  //FIXME: conflicts with other random seedings
	var x, z;
	var intersectInfo;
	for (x = this.__xMinMultiple; x <= this.__xMaxMultiple + this.__EPSILON; x += this.voxelSizeX)
	{
		this.intersectionFirstAndLastHeights[x] = {};
		for (z = this.__zMinMultiple; z <= this.__zMaxMultiple + this.__EPSILON; z += this.voxelSizeZ)
		{
			//get first and last intersection points
			this.__startPoint.x = x; // + Math.random() * this.__EPSILON;  //need to add small random offsets to prevent hitting exactly on vertices which causes intersection test to fail
			this.__startPoint.z = z; // + Math.random() * this.__EPSILON;  //need to add small random offsets to prevent hitting exactly on vertices which causes intersection test to fail
			this.__raycaster.set(this.__startPoint, this.__up);
			intersectInfo = this.__raycaster.intersectObject(this.mesh);
			if (intersectInfo && intersectInfo.length >= 2)
			{
				this.intersectionFirstAndLastHeights[x][z] = [];
				this.intersectionFirstAndLastHeights[x][z].push(intersectInfo[0].point.y);
				this.intersectionFirstAndLastHeights[x][z].push(intersectInfo[intersectInfo.length-1].point.y);
			}
		}
	}
}

SkVoxelizer.prototype.voxelize = function()
{
	//calculate the intersection points first
	this.updateIntersections();

	//do the voxelization
	var x, y, z;
	var count = 0;
	for (x = this.__xMinMultiple; x <= this.__xMaxMultiple + this.__EPSILON; x += this.voxelSizeX)
	{
		this.voxelData[x] = {};
		for (z = this.__zMinMultiple; z <= this.__zMaxMultiple + this.__EPSILON; z += this.voxelSizeZ)
		{
			this.voxelData[x][z] = {};
			for (y = this.__yMinMultiple; y <= this.__yMaxMultiple + this.__EPSILON; y += this.voxelSizeY)
			{
				//check y against the intersection boundaries for this (x,z) value
				if (this.intersectionFirstAndLastHeights[x][z])
				{
					if (y <= this.intersectionFirstAndLastHeights[x][z][0] || y >= this.intersectionFirstAndLastHeights[x][z][1])
					{
						this.voxelData[x][z][y] = 0;
					}
					else
					{
						this.voxelData[x][z][y] = 1;
					}
				}
			}
		}
	}
}

SkVoxelizer.prototype.hideAllVoxels = function()
{
	var x, y, z;
	for (xId in this.__voxelMeshes)
	{
		x = this.__voxelMeshes[xId];
		for (zId in x)
		{
			z = x[zId];
			for (yId in z)
			{
				y = z[yId];
				y.visible = false;
			}
		}
	}
}

//Use this for debugging purposes only. It is very slow.
SkVoxelizer.prototype.visualize = function(scene)
{
	//turn off all voxels first
	this.hideAllVoxels();

	//show voxel mesh if voxel data has value of 1
	var x, y, z, thisVoxelMesh;
	for (x = this.__xMinMultiple; x <= this.__xMaxMultiple + this.__EPSILON; x += this.voxelSizeX)
	{
		if (!this.__voxelMeshes[x]) this.__voxelMeshes[x] = {};
		for (z = this.__zMinMultiple; z <= this.__zMaxMultiple + this.__EPSILON; z += this.voxelSizeZ)
		{
			if (!this.__voxelMeshes[x][z]) this.__voxelMeshes[x][z] = {};
			for (y = this.__yMinMultiple; y <= this.__yMaxMultiple + this.__EPSILON; y += this.voxelSizeY)
			{
				//create a new voxel mesh if it has not been created at this space previously
				if (!this.__voxelMeshes[x][z][y])
				{
					thisVoxelMesh = new THREE.Mesh(this.__voxelGeom, this.__voxelMaterial);
					this.__voxelMeshes[x][z][y] = thisVoxelMesh;
					thisVoxelMesh.position.x = x;
					thisVoxelMesh.position.y = y;
					thisVoxelMesh.position.z = z;
					thisVoxelMesh.visible = false;
					scene.add(thisVoxelMesh);
				}

				//show the voxel mesh if voxel data is 1
				if (this.voxelData[x][z][y] === 1)
				{
					this.__voxelMeshes[x][z][y].visible = true;
				}
			}
		}
	}
}
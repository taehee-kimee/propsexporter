// This is the main plugin code that runs in Figma's backend
// It doesn't have access to the browser or DOM, only to the Figma API

// Show the plugin UI window (larger size for two-column layout)
figma.showUI(__html__, { width: 800, height: 600 });

// Send loading state to UI
figma.ui.postMessage({ type: 'loading', message: 'Loading components...' });

// Load components in background
(async () => {
  await getAllComponents();
})();

// Send initial selection state
function sendSelectionUpdate() {
  const selection = figma.currentPage.selection;
  if (selection.length === 1) {
    const node = selection[0];
    if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET' || node.type === 'INSTANCE') {
      // Export component properties for display
      const properties: Record<string, string> = {};
      
      // Get property definitions
      let propertyDefinitions;
      let nodeName = node.name;
      
      if (node.type === 'INSTANCE') {
        // For instances, get the component properties and their current values
        const instanceNode = node as InstanceNode;
        if (instanceNode.mainComponent) {
          // Get the main component
          const mainComponent = instanceNode.mainComponent;
          
          // Get property definitions from the main component or its parent
          if (mainComponent.parent && mainComponent.parent.type === 'COMPONENT_SET') {
            propertyDefinitions = mainComponent.parent.componentPropertyDefinitions;
          } else {
            propertyDefinitions = mainComponent.componentPropertyDefinitions;
          }
          
          // Get actual property values from the instance
          if (propertyDefinitions) {
            for (const propKey in propertyDefinitions) {
              const propDef = propertyDefinitions[propKey];
              const propName = propKey.split('#')[0];
              
              // Get the actual value from the instance
              const instanceValue = instanceNode.componentProperties?.[propKey];
              
              if (instanceValue !== undefined) {
                if (propDef.type === 'VARIANT') {
                  properties[propName] = String(instanceValue);
                } else if (propDef.type === 'BOOLEAN') {
                  properties[propName] = String(instanceValue);
                } else if (propDef.type === 'TEXT') {
                  properties[propName] = String(instanceValue);
                } else if (propDef.type === 'INSTANCE_SWAP') {
                  properties[propName] = instanceValue ? 'instance' : 'none';
                }
              }
            }
          }
          
          // Use the main component name
          nodeName = mainComponent.parent && mainComponent.parent.type === 'COMPONENT_SET' 
            ? mainComponent.parent.name 
            : mainComponent.name;
        }
      } else if (node.type === 'COMPONENT') {
        const componentNode = node as ComponentNode;
        
        if (componentNode.parent && componentNode.parent.type === 'COMPONENT_SET') {
          // This is a variant, get properties from the parent ComponentSet
          propertyDefinitions = componentNode.parent.componentPropertyDefinitions;
          nodeName = componentNode.parent.name;
          
          // Get the actual values from this variant's name
          // Variant names are like "Size=Small, State=Hover"
          const variantProps = componentNode.name.split(', ');
          for (const prop of variantProps) {
            const [key, value] = prop.split('=');
            if (key && value) {
              properties[key.trim()] = value.trim();
            }
          }
        } else {
          // This is a standalone component
          propertyDefinitions = componentNode.componentPropertyDefinitions;
          
          // Export default values
          if (propertyDefinitions) {
            for (const propKey in propertyDefinitions) {
              const propDef = propertyDefinitions[propKey];
              const propName = propKey.split('#')[0];
              
              if (propDef.type === 'VARIANT') {
                const defaultValue = propDef.defaultValue || propDef.variantOptions?.[0] || '';
                properties[propName] = String(defaultValue);
              } else if (propDef.type === 'BOOLEAN') {
                properties[propName] = String(propDef.defaultValue || false);
              } else if (propDef.type === 'TEXT') {
                const textValue = propDef.defaultValue || '';
                properties[propName] = String(textValue);
              } else if (propDef.type === 'INSTANCE_SWAP') {
                properties[propName] = propDef.defaultValue ? 'instance' : 'none';
              }
            }
          }
        }
      } else if (node.type === 'COMPONENT_SET') {
        propertyDefinitions = node.componentPropertyDefinitions;
        // For component sets, show available properties with default values
        if (propertyDefinitions) {
          for (const propKey in propertyDefinitions) {
            const propDef = propertyDefinitions[propKey];
            const propName = propKey.split('#')[0];
            
            if (propDef.type === 'VARIANT') {
              const defaultValue = propDef.defaultValue || propDef.variantOptions?.[0] || '';
              properties[propName] = String(defaultValue);
            } else if (propDef.type === 'BOOLEAN') {
              properties[propName] = String(propDef.defaultValue || false);
            } else if (propDef.type === 'TEXT') {
              const textValue = propDef.defaultValue || '';
              properties[propName] = String(textValue);
            } else if (propDef.type === 'INSTANCE_SWAP') {
              properties[propName] = propDef.defaultValue ? 'instance' : 'none';
            }
          }
        }
      }
      
      figma.ui.postMessage({
        type: 'selection-changed',
        selection: {
          name: nodeName,
          type: node.type,
          properties: properties
        }
      });
      return;
    }
  }
  // No valid selection
  figma.ui.postMessage({
    type: 'selection-changed',
    selection: null
  });
}

// Send initial selection
sendSelectionUpdate();

// Listen for selection changes
figma.on('selectionchange', () => {
  sendSelectionUpdate();
});

// Listen for document changes to notify UI
figma.on('documentchange', (event) => {
  // Check if any component-related changes occurred
  const hasComponentChanges = event.documentChanges.some(change => 
    change.type === 'CREATE' || 
    change.type === 'DELETE' || 
    (change.type === 'PROPERTY_CHANGE' && change.properties.includes('name'))
  );
  
  if (hasComponentChanges) {
    // Notify UI that components list may have changed
    figma.ui.postMessage({
      type: 'components-changed'
    });
  }
});

// Listen for messages from the UI
figma.ui.onmessage = async (msg) => {
  // When the UI asks to Export properties from current selection
  if (msg.type === 'Export-properties') {
    ExportComponentProperties(msg.options);
  }
  
  // When the UI asks to get all components in the file
  if (msg.type === 'get-components') {
    await getAllComponents(msg.forceRefresh || false);
  }
  
  // When the UI asks to refresh components (clear cache)
  if (msg.type === 'refresh-components') {
    await figma.clientStorage.deleteAsync('componentsList');
    await figma.clientStorage.deleteAsync('componentsHash');
    await getAllComponents(true);
  }
  
  // When the UI asks to Export multiple components
  if (msg.type === 'Export-multiple') {
    ExportMultipleComponents(msg.componentIds, msg.options);
  }
  
  // When the UI asks to close the plugin
  if (msg.type === 'cancel') {
    figma.closePlugin();
  }
};

/**
 * Main function to Export component properties from the current selection
 */
function ExportComponentProperties(options: any) {
  // Get the currently selected node in Figma
  const selection = figma.currentPage.selection;
  
  // Check if exactly one node is selected
  if (selection.length === 0) {
    sendError('Please select a component or component set.');
    return;
  }
  
  if (selection.length > 1) {
    sendError('Please select only one component or component set.');
    return;
  }
  
  const node = selection[0];
  
  // Check if the selected node is a Component or ComponentSet
  if (node.type === 'COMPONENT') {
    // Single component
    const result = ExportFromComponent(node, options);
    sendSuccess(result);
  } else if (node.type === 'COMPONENT_SET') {
    // Component set (variants)
    const result = ExportFromComponentSet(node, options);
    sendSuccess(result);
  } else {
    sendError('Selected node must be a Component or Component Set. You selected: ' + node.type);
  }
}

/**
 * Export properties from a single Component
 */
function ExportFromComponent(component: ComponentNode, options: any) {
  const componentName = component.name;
  const result: any = {
    [componentName]: {}
  };
  
  // Export properties if selected
  if (options.property) {
    // Check if this is a variant component (child of ComponentSet)
    let propertyDefinitions;
    if (component.parent && component.parent.type === 'COMPONENT_SET') {
      // This is a variant, get properties from the parent ComponentSet
      propertyDefinitions = component.parent.componentPropertyDefinitions;
    } else {
      // This is a standalone component
      propertyDefinitions = component.componentPropertyDefinitions;
    }
    result[componentName].props = ExportProperties(propertyDefinitions);
  }
  
  // Export anatomy if selected
  if (options.anatomy) {
    result[componentName].anatomy = ExportAnatomy(component);
  }
  
  // Export element styles if selected
  if (options.elementStyles) {
    result[componentName].elementStyles = ExportElementStyles(component);
  }
  
  // Export figma styles if selected
  if (options.figmaStyles) {
    result[componentName].figmaStyles = ExportFigmaStyles(component);
  }
  
  // Export tokens if selected
  if (options.tokens) {
    result[componentName].tokens = ExportTokens(component);
  }
  
  return result;
}

/**
 * Export properties from a ComponentSet (variants)
 */
function ExportFromComponentSet(componentSet: ComponentSetNode, options: any) {
  const componentName = componentSet.name;
  const result: any = {
    [componentName]: {}
  };
  
  // Export properties if selected
  if (options.property) {
    result[componentName].props = ExportProperties(componentSet.componentPropertyDefinitions);
  }
  
  // Export anatomy if selected
  if (options.anatomy) {
    result[componentName].anatomy = ExportAnatomy(componentSet);
  }
  
  // Export element styles if selected
  if (options.elementStyles) {
    result[componentName].elementStyles = ExportElementStyles(componentSet);
  }
  
  // Export figma styles if selected
  if (options.figmaStyles) {
    result[componentName].figmaStyles = ExportFigmaStyles(componentSet);
  }
  
  // Export tokens if selected
  if (options.tokens) {
    result[componentName].tokens = ExportTokens(componentSet);
  }
  
  return result;
}

/**
 * Export component properties
 */
function ExportProperties(componentProperties: any): any {
  const props: any = {};
  
  // If no properties, return empty props
  if (!componentProperties) {
    return {};
  }
  
  // Loop through each property definition
  for (const propKey in componentProperties) {
    const propDef = componentProperties[propKey];
    // Remove the random ID suffix (e.g., "Clearable#18924:0" -> "Clearable")
    const propName = propKey.split('#')[0];
    
    // Check the type of property
    if (propDef.type === 'BOOLEAN') {
      // Boolean property (true/false)
      props[propName] = {
        type: 'boolean'
      };
    } else if (propDef.type === 'VARIANT') {
      // Check if it's a true boolean (has only true/false values) or enum
      const options = propDef.variantOptions || [];
      const isBooleanVariant = options.length === 2 && 
        options.includes('true') && options.includes('false');
      
      if (isBooleanVariant) {
        // Boolean disguised as variant
        props[propName] = {
          type: 'boolean'
        };
      } else {
        // Variant property (enum with options)
        props[propName] = {
          type: 'enum',
          values: options
        };
      }
    } else if (propDef.type === 'TEXT') {
      // Text property
      props[propName] = {
        type: 'string',
        default: propDef.defaultValue || ''
      };
    } else if (propDef.type === 'INSTANCE_SWAP') {
      // Instance swap property
      props[propName] = {
        type: 'instance'
      };
    }
  }
  
  return props;
}

/**
 * Export anatomy (child structure) from a component
 */
function ExportAnatomy(node: ComponentNode | ComponentSetNode): any {
  const anatomy: any = {};
  
  function traverseNode(n: SceneNode, path: string = '') {
    const nodeName = n.name;
    const fullPath = path ? `${path} > ${nodeName}` : nodeName;
    
    anatomy[nodeName] = {
      type: n.type,
      path: fullPath
    };
    
    // If node has children, traverse them
    if ('children' in n) {
      for (const child of n.children) {
        traverseNode(child, fullPath);
      }
    }
  }
  
  // For ComponentSet, get the first variant
  if (node.type === 'COMPONENT_SET' && node.children.length > 0) {
    const firstVariant = node.children[0];
    if ('children' in firstVariant) {
      for (const child of firstVariant.children) {
        traverseNode(child);
      }
    }
  } else if ('children' in node) {
    // For regular Component, traverse its children
    for (const child of node.children) {
      traverseNode(child);
    }
  }
  
  return anatomy;
}

/**
 * Export element styles (inline styles) from a component
 */
function ExportElementStyles(node: ComponentNode | ComponentSetNode): any {
  const styles: any = {};
  
  function getNodeStyles(n: SceneNode): any {
    const nodeStyles: any = {
      name: n.name,
      type: n.type
    };
    
    // Get bound variables to check for tokens
    const boundVariables = n.boundVariables;
    
    // Helper function to get token name or actual value
    function getValueOrToken(propertyName: string, actualValue: any): any {
      if (boundVariables && propertyName in boundVariables) {
        const varRef = (boundVariables as any)[propertyName];
        if (varRef && 'id' in varRef) {
          try {
            const variable = figma.variables.getVariableById(varRef.id);
            if (variable) {
              return `$${variable.name}`;
            }
          } catch (e) {
            // Variable might not exist, return actual value
          }
        }
      }
      return actualValue;
    }
    
    // Export fill/stroke properties
    if ('fills' in n && Array.isArray(n.fills)) {
      // Check if fills are bound to a variable
      if (boundVariables && 'fills' in boundVariables && Array.isArray(boundVariables.fills)) {
        const fillTokens = [];
        for (const fillVar of boundVariables.fills) {
          if (fillVar && 'id' in fillVar) {
            try {
              const variable = figma.variables.getVariableById(fillVar.id);
              if (variable) {
                fillTokens.push(`$${variable.name}`);
              }
            } catch (e) {
              // Variable might not exist
            }
          }
        }
        if (fillTokens.length > 0) {
          nodeStyles.fills = fillTokens;
        }
      }
      
      // If no token found, use actual values
      if (!nodeStyles.fills) {
        nodeStyles.fills = (n.fills as Paint[]).map(fill => {
          if (fill.type === 'SOLID') {
            return {
              type: 'SOLID',
              color: fill.color,
              opacity: fill.opacity
            };
          }
          return { type: fill.type };
        });
      }
    }
    
    if ('strokes' in n && Array.isArray(n.strokes)) {
      nodeStyles.strokes = (n.strokes as Paint[]).map(stroke => {
        if (stroke.type === 'SOLID') {
          return {
            type: 'SOLID',
            color: stroke.color,
            opacity: stroke.opacity
          };
        }
        return { type: stroke.type };
      });
    }
    
    // Export text properties
    if (n.type === 'TEXT') {
      const textNode = n as TextNode;
      nodeStyles.fontSize = getValueOrToken('fontSize', textNode.fontSize);
      nodeStyles.fontName = textNode.fontName;
      nodeStyles.textAlignHorizontal = textNode.textAlignHorizontal;
      nodeStyles.textAlignVertical = textNode.textAlignVertical;
      nodeStyles.letterSpacing = getValueOrToken('letterSpacing', textNode.letterSpacing);
      nodeStyles.lineHeight = getValueOrToken('lineHeight', textNode.lineHeight);
    }
    
    // Export layout properties
    if ('layoutMode' in n) {
      nodeStyles.layoutMode = n.layoutMode;
      nodeStyles.primaryAxisAlignItems = n.primaryAxisAlignItems;
      nodeStyles.counterAxisAlignItems = n.counterAxisAlignItems;
      nodeStyles.paddingLeft = getValueOrToken('paddingLeft', n.paddingLeft);
      nodeStyles.paddingRight = getValueOrToken('paddingRight', n.paddingRight);
      nodeStyles.paddingTop = getValueOrToken('paddingTop', n.paddingTop);
      nodeStyles.paddingBottom = getValueOrToken('paddingBottom', n.paddingBottom);
      nodeStyles.itemSpacing = getValueOrToken('itemSpacing', n.itemSpacing);
    }
    
    // Export size properties
    nodeStyles.width = getValueOrToken('width', n.width);
    nodeStyles.height = getValueOrToken('height', n.height);
    
    // Export corner radius
    if ('cornerRadius' in n) {
      nodeStyles.cornerRadius = getValueOrToken('cornerRadius', n.cornerRadius);
    }
    
    return nodeStyles;
  }
  
  function traverseForStyles(n: SceneNode) {
    styles[n.name] = getNodeStyles(n);
    
    // If node has children, traverse them
    if ('children' in n) {
      for (const child of n.children) {
        traverseForStyles(child);
      }
    }
  }
  
  // For ComponentSet, get the first variant
  if (node.type === 'COMPONENT_SET' && node.children.length > 0) {
    const firstVariant = node.children[0];
    if ('children' in firstVariant) {
      for (const child of firstVariant.children) {
        traverseForStyles(child);
      }
    }
  } else if ('children' in node) {
    // For regular Component, traverse its children
    for (const child of node.children) {
      traverseForStyles(child);
    }
  }
  
  return styles;
}

/**
 * Export Figma styles (named styles) applied to a component
 */
function ExportFigmaStyles(node: ComponentNode | ComponentSetNode): any {
  const figmaStyles: any = {
    fillStyles: [],
    strokeStyles: [],
    textStyles: [],
    effectStyles: []
  };
  
  function collectStyles(n: SceneNode) {
    // Collect fill style
    if ('fillStyleId' in n && n.fillStyleId && n.fillStyleId !== '') {
      const style = figma.getStyleById(n.fillStyleId as string);
      if (style) {
        figmaStyles.fillStyles.push({
          node: n.name,
          styleName: style.name
        });
      }
    }
    
    // Collect stroke style
    if ('strokeStyleId' in n && n.strokeStyleId && n.strokeStyleId !== '') {
      const style = figma.getStyleById(n.strokeStyleId as string);
      if (style) {
        figmaStyles.strokeStyles.push({
          node: n.name,
          styleName: style.name
        });
      }
    }
    
    // Collect text style
    if (n.type === 'TEXT') {
      const textNode = n as TextNode;
      if (textNode.textStyleId && textNode.textStyleId !== '') {
        const style = figma.getStyleById(textNode.textStyleId as string);
        if (style) {
          figmaStyles.textStyles.push({
            node: n.name,
            styleName: style.name
          });
        }
      }
    }
    
    // Collect effect style
    if ('effectStyleId' in n && n.effectStyleId && n.effectStyleId !== '') {
      const style = figma.getStyleById(n.effectStyleId as string);
      if (style) {
        figmaStyles.effectStyles.push({
          node: n.name,
          styleName: style.name
        });
      }
    }
    
    // Traverse children
    if ('children' in n) {
      for (const child of n.children) {
        collectStyles(child);
      }
    }
  }
  
  // For ComponentSet, get the first variant
  if (node.type === 'COMPONENT_SET' && node.children.length > 0) {
    const firstVariant = node.children[0];
    if ('children' in firstVariant) {
      for (const child of firstVariant.children) {
        collectStyles(child);
      }
    }
  } else if ('children' in node) {
    // For regular Component, traverse its children
    for (const child of node.children) {
      collectStyles(child);
    }
  }
  
  // Remove empty arrays
  const result: any = {};
  if (figmaStyles.fillStyles.length > 0) result.fillStyles = figmaStyles.fillStyles;
  if (figmaStyles.strokeStyles.length > 0) result.strokeStyles = figmaStyles.strokeStyles;
  if (figmaStyles.textStyles.length > 0) result.textStyles = figmaStyles.textStyles;
  if (figmaStyles.effectStyles.length > 0) result.effectStyles = figmaStyles.effectStyles;
  
  return result;
}

/**
 * Export design tokens (variables) from a component
 */
function ExportTokens(node: ComponentNode | ComponentSetNode): any {
  const tokens: any = {
    colors: [],
    spacing: [],
    sizing: [],
    typography: [],
    other: []
  };
  
  function collectTokens(n: SceneNode) {
    // Collect bound variables
    const boundVariables = n.boundVariables;
    
    if (boundVariables) {
      // Check fills
      if ('fills' in boundVariables && Array.isArray(boundVariables.fills)) {
        for (const fillVar of boundVariables.fills) {
          if (fillVar && 'id' in fillVar) {
            try {
              const variable = figma.variables.getVariableById(fillVar.id);
              if (variable) {
                tokens.colors.push({
                  node: n.name,
                  variableName: variable.name
                });
              }
            } catch (e) {
              // Variable might not exist
            }
          }
        }
      }
      
      // Check other properties that might have variables
      const propertyMappings = [
        { prop: 'itemSpacing', category: 'spacing' },
        { prop: 'paddingLeft', category: 'spacing' },
        { prop: 'paddingRight', category: 'spacing' },
        { prop: 'paddingTop', category: 'spacing' },
        { prop: 'paddingBottom', category: 'spacing' },
        { prop: 'width', category: 'sizing' },
        { prop: 'height', category: 'sizing' },
        { prop: 'cornerRadius', category: 'sizing' }
      ];
      
      for (const mapping of propertyMappings) {
        if (mapping.prop in boundVariables) {
          const varRef = (boundVariables as any)[mapping.prop];
          if (varRef && 'id' in varRef) {
            try {
              const variable = figma.variables.getVariableById(varRef.id);
              if (variable) {
                tokens[mapping.category].push({
                  node: n.name,
                  property: mapping.prop,
                  variableName: variable.name
                });
              }
            } catch (e) {
              // Variable might not exist
            }
          }
        }
      }
    }
    
    // Traverse children
    if ('children' in n) {
      for (const child of n.children) {
        collectTokens(child);
      }
    }
  }
  
  // For ComponentSet, get the first variant
  if (node.type === 'COMPONENT_SET' && node.children.length > 0) {
    const firstVariant = node.children[0];
    if ('children' in firstVariant) {
      for (const child of firstVariant.children) {
        collectTokens(child);
      }
    }
  } else if ('children' in node) {
    // For regular Component, traverse its children
    for (const child of node.children) {
      collectTokens(child);
    }
  }
  
  // Remove empty arrays
  const result: any = {};
  if (tokens.colors.length > 0) result.colors = tokens.colors;
  if (tokens.spacing.length > 0) result.spacing = tokens.spacing;
  if (tokens.sizing.length > 0) result.sizing = tokens.sizing;
  if (tokens.typography.length > 0) result.typography = tokens.typography;
  if (tokens.other.length > 0) result.other = tokens.other;
  
  return result;
}

/**
 * Generate a simple hash of component names and IDs for change detection
 */
async function getComponentsHash(): Promise<string> {
  const componentIds: string[] = [];
  
  function findComponentIds(node: BaseNode) {
    if (node.type === 'COMPONENT_SET') {
      const compSet = node as ComponentSetNode;
      if (compSet.key && !compSet.name.startsWith('.')) {
        componentIds.push(`${node.id}:${node.name}`);
      }
    } else if (node.type === 'COMPONENT') {
      if (!node.parent || node.parent.type !== 'COMPONENT_SET') {
        const comp = node as ComponentNode;
        if (comp.key && !comp.name.startsWith('.')) {
          componentIds.push(`${node.id}:${node.name}`);
        }
      }
    }
    
    if ('children' in node) {
      for (const child of node.children) {
        findComponentIds(child);
      }
    }
  }
  
  for (const page of figma.root.children) {
    findComponentIds(page);
  }
  
  // Create a simple hash from sorted IDs
  return componentIds.sort().join('|');
}

/**
 * Get all components and component sets in the current file with caching
 */
async function getAllComponents(forceRefresh: boolean = false) {
  try {
    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = await figma.clientStorage.getAsync('componentsList');
      const cachedHash = await figma.clientStorage.getAsync('componentsHash');
      
      // Quick check: if we have cached data, send it first, then verify in background
      if (cached && cachedHash) {
        console.log('Sending cached components, verifying freshness...');
        
        // Send cached data immediately
        figma.ui.postMessage({
          type: 'components-list',
          components: cached,
          fromCache: false
        });
        
        // Verify if components have changed by doing a quick scan
        const quickScan = await getComponentsHash();
        
        if (quickScan !== cachedHash) {
          console.log('Components have changed, prompting refresh');
          // Components changed, update cache and notify UI
          figma.ui.postMessage({
            type: 'components-list',
            components: cached,
            fromCache: true // Show refresh button
          });
        } else {
          console.log('Components unchanged');
          return;
        }
      }
    }
    
    // Fetch fresh data
    console.log('Fetching fresh components');
    const components: any[] = [];
    
    // Find all components in the document
    function findComponents(node: BaseNode) {
      // Only include ComponentSets and standalone Components (not variants)
      if (node.type === 'COMPONENT_SET') {
        // Check if published (has a component key) and not hidden (starts with .)
        const compSet = node as ComponentSetNode;
        if (compSet.key && !compSet.name.startsWith('.')) {
          components.push({
            id: node.id,
            name: node.name,
            type: 'COMPONENT_SET'
          });
        }
      } else if (node.type === 'COMPONENT') {
        // Only add if it's NOT a variant (not a child of ComponentSet)
        if (!node.parent || node.parent.type !== 'COMPONENT_SET') {
          const comp = node as ComponentNode;
          // Check if published (has a component key) and not hidden (starts with .)
          if (comp.key && !comp.name.startsWith('.')) {
            components.push({
              id: node.id,
              name: node.name,
              type: 'COMPONENT'
            });
          }
        }
      }
      
      // Traverse children
      if ('children' in node) {
        for (const child of node.children) {
          findComponents(child);
        }
      }
    }
    
    // Search through all pages
    for (const page of figma.root.children) {
      findComponents(page);
    }
    
    // Save to cache with components hash
    const componentsHash = await getComponentsHash();
    await figma.clientStorage.setAsync('componentsList', components);
    await figma.clientStorage.setAsync('componentsHash', componentsHash);
    
    // Send the list to UI
    figma.ui.postMessage({
      type: 'components-list',
      components: components,
      fromCache: false
    });
  } catch (error) {
    console.error('Error getting components:', error);
    figma.ui.postMessage({
      type: 'error',
      message: 'Failed to load components'
    });
  }
}

/**
 * Export multiple components by their IDs
 */
function ExportMultipleComponents(componentIds: string[], options: any) {
  const results: any = {};
  
  for (const id of componentIds) {
    const node = figma.getNodeById(id);
    
    if (!node) {
      continue;
    }
    
    if (node.type === 'COMPONENT') {
      const result = ExportFromComponent(node as ComponentNode, options);
      Object.assign(results, result);
    } else if (node.type === 'COMPONENT_SET') {
      const result = ExportFromComponentSet(node as ComponentSetNode, options);
      Object.assign(results, result);
    }
  }
  
  if (Object.keys(results).length === 0) {
    sendError('No valid components found to Export.');
  } else {
    sendSuccess(results);
  }
}

/**
 * Send success message with JSON result to the UI
 */
function sendSuccess(result: any) {
  figma.ui.postMessage({
    type: 'Exportion-result',
    data: result
  });
}

/**
 * Send error message to the UI
 */
function sendError(message: string) {
  figma.ui.postMessage({
    type: 'error',
    message: message
  });
}

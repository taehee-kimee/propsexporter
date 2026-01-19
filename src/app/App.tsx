import React, { useState, useEffect } from 'react';
import {
  Search,
  RefreshCcw,
  Copy,
  Check,
  FileJson,
  FileText,
  Play,
  Box,
  MousePointer2,
  Download
} from 'lucide-react';
import { toast } from 'sonner';

import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Card } from './components/ui/card';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Checkbox } from './components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from './components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './components/ui/dropdown-menu';
import { ScrollArea } from './components/ui/scroll-area';
import { Separator } from './components/ui/separator';
import { Textarea } from './components/ui/textarea';
import { Badge } from './components/ui/badge';

import {
  convertToJSON,
  convertToYAML,
  convertAnatomyToTree,
  convertToTypeScript,
  convertToJSDoc,
  convertToMarkdown
} from './utils/converters';

import {
  downloadMarkdownFile,
  downloadMultipleMarkdownFiles
} from './utils/fileDownload';

import { Toaster } from './components/ui/sonner';

type OutputFormat = 'json' | 'yaml' | 'typescript' | 'jsdoc';
type AnatomyView = 'yaml' | 'tree';

export default function App() {
  console.log("App component rendering...");
  
  // State
  const [activeTab, setActiveTab] = useState<string>('selection');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedComponentIds, setSelectedComponentIds] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  const [output, setOutput] = useState('');
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('yaml');
  const [anatomyView, setAnatomyView] = useState<AnatomyView>('yaml');
  const [selection, setSelection] = useState<{name: string, type: string, properties?: Record<string, string>} | null>(null);
  const [components, setComponents] = useState<Array<{id: string, name: string, type: string}>>([]);
  const [ExportedData, setExportedData] = useState<any>(null);
  const [isLoadingComponents, setIsLoadingComponents] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  
  // Options State
  const [options, setOptions] = useState({
    property: true,
    anatomy: true,
    elementStyles: true,
    figmaStyles: true,
    tokens: true
  });

  // Derived state for filtered components
  const filteredComponents = components.filter(comp => 
    comp.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  // Load components from Figma on mount
  useEffect(() => {
    // Request all components from Figma
    parent.postMessage({ pluginMessage: { type: 'get-components' } }, '*');
    
    // Listen for messages from Figma plugin
    window.addEventListener('message', (event) => {
      const msg = event.data.pluginMessage;
      if (!msg) return;
      
      if (msg.type === 'loading') {
        setIsLoadingComponents(true);
      }
      
      if (msg.type === 'components-list') {
        setComponents(msg.components);
        setIsLoadingComponents(false);
        setFromCache(msg.fromCache || false);
      }
      
      if (msg.type === 'Exportion-result') {
        // Store raw data from Figma
        setExportedData(msg.data);
        setIsExporting(false);
        toast.success('Properties Exported successfully');
      }
      
      if (msg.type === 'error') {
        toast.error(msg.message);
        setIsExporting(false);
      }
      
      if (msg.type === 'selection-changed') {
        if (msg.selection) {
          setSelection(msg.selection);
        } else {
          setSelection(null);
        }
      }
      
      if (msg.type === 'components-changed') {
        // Refresh components list
        parent.postMessage({ pluginMessage: { type: 'get-components' } }, '*');
      }
    });
  }, []);

  // Reformat output when format or Exported data changes
  useEffect(() => {
    if (!ExportedData) {
      setOutput('');
      return;
    }

    let formattedOutput = '';

    // Check if ExportedData has anatomy data
    const hasAnatomy = Object.values(ExportedData).some((component: any) =>
      component && component.anatomy && Object.keys(component.anatomy).length > 0
    );

    // If tree view is selected and anatomy exists, replace anatomy with tree format
    if (anatomyView === 'tree' && options.anatomy && hasAnatomy) {
      // Create a modified data structure with anatomy replaced by tree format
      const modifiedData: any = {};

      for (const componentName in ExportedData) {
        const component = ExportedData[componentName];
        modifiedData[componentName] = { ...component };

        // Replace anatomy with tree representation
        if (component && component.anatomy && Object.keys(component.anatomy).length > 0) {
          modifiedData[componentName].anatomy = `\n${convertAnatomyToTree(component.anatomy)}`;
        }
      }

      // Convert the modified data to the selected format
      switch (outputFormat) {
        case 'json':
          formattedOutput = convertToJSON(modifiedData);
          break;
        case 'yaml':
          formattedOutput = convertToYAML(modifiedData);
          break;
        case 'typescript':
          formattedOutput = convertToTypeScript(modifiedData);
          break;
        case 'jsdoc':
          formattedOutput = convertToJSDoc(modifiedData);
          break;
      }
    } else {
      // Otherwise convert to selected format as-is
      switch (outputFormat) {
        case 'json':
          formattedOutput = convertToJSON(ExportedData);
          break;
        case 'yaml':
          formattedOutput = convertToYAML(ExportedData);
          break;
        case 'typescript':
          formattedOutput = convertToTypeScript(ExportedData);
          break;
        case 'jsdoc':
          formattedOutput = convertToJSDoc(ExportedData);
          break;
      }
    }

    setOutput(formattedOutput);
  }, [ExportedData, outputFormat, anatomyView, options.anatomy]);

  // Handlers
  const toggleComponentSelection = (id: string) => {
    const newSet = new Set(selectedComponentIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedComponentIds(newSet);
  };

  const handleOptionChange = (key: keyof typeof options) => {
    if (key === 'elementStyles') {
      // When toggling Styles, update both elementStyles and figmaStyles
      setOptions(prev => ({ 
        ...prev, 
        elementStyles: !prev.elementStyles,
        figmaStyles: !prev.elementStyles
      }));
    } else {
      setOptions(prev => ({ ...prev, [key]: !prev[key] }));
    }
  };

  const handleExport = () => {
    setIsExporting(true);
    
    if (activeTab === 'selection') {
      // Export from current selection
      parent.postMessage({ 
        pluginMessage: { 
          type: 'Export-properties', 
          options: options 
        } 
      }, '*');
    } else {
      // Export multiple selected components
      if (selectedComponentIds.size === 0) {
        toast.error('Please select at least one component');
        setIsExporting(false);
        return;
      }
      parent.postMessage({ 
        pluginMessage: { 
          type: 'Export-multiple', 
          componentIds: Array.from(selectedComponentIds),
          options: options 
        } 
      }, '*');
    }
  };

  const handleCopy = () => {
    if (!output) return;

    try {
      // Create a temporary textarea element
      const textarea = document.createElement('textarea');
      textarea.value = output;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);

      // Select and copy the text
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
      const successful = document.execCommand('copy');

      // Remove the temporary element
      document.body.removeChild(textarea);

      if (successful) {
        toast.success("Copied to clipboard");
      } else {
        toast.error("Failed to copy");
      }
    } catch (error) {
      toast.error("Failed to copy");
    }
  };

  const handleDownloadFull = () => {
    if (!ExportedData) return;

    try {
      const markdownContent = convertToMarkdown(ExportedData, {
        anatomyView,
        includeTableOfContents: Object.keys(ExportedData).length > 1
      });

      const filename = Object.keys(ExportedData).length === 1
        ? Object.keys(ExportedData)[0]
        : 'figma-export';

      downloadMarkdownFile(markdownContent, filename);
      toast.success("Markdown file downloaded");
    } catch (error) {
      toast.error("Failed to download file");
      console.error(error);
    }
  };

  const handleDownloadSeparate = async () => {
    if (!ExportedData) return;

    try {
      const components = Object.entries(ExportedData).map(([name, data]) => ({
        name,
        markdown: convertToMarkdown({ [name]: data }, {
          anatomyView,
          includeTableOfContents: false,
          componentName: name
        })
      }));

      await downloadMultipleMarkdownFiles(components);
      toast.success("Components downloaded as zip");
    } catch (error) {
      toast.error("Failed to download files");
      console.error(error);
    }
  };
  
  const handleRefreshComponents = () => {
    setIsLoadingComponents(true);
    setFromCache(false);
    parent.postMessage({ pluginMessage: { type: 'refresh-components' } }, '*');
  };

  return (
    <div className="flex h-screen w-full bg-white text-slate-900 font-sans overflow-hidden">
      <Toaster position="bottom-right" />
      {/* Left Panel: Controls */}
      <aside className="w-[340px] flex flex-col border-r border-slate-200 bg-slate-50/50">


        <div className="flex-1 overflow-hidden flex flex-col">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex-1 flex flex-col">
            <div className="px-4 pt-4">
              <TabsList className="w-full grid grid-cols-2">
                <TabsTrigger value="selection">Selection</TabsTrigger>
                <TabsTrigger value="browse">Browse</TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-hidden relative">
              <TabsContent value="selection" className="h-full m-0 pt-2 px-4 pb-4 absolute inset-0">
                {selection ? (
                  <div className="flex flex-col h-full p-6 border-2 border-blue-100 rounded-lg bg-blue-50/50">
                    <h2 className="text-xl font-bold text-slate-900 mb-4 text-center">{selection.name}</h2>
                    {selection.properties && Object.keys(selection.properties).length > 0 ? (
                      <div className="flex-1 overflow-auto">
                        <div className="space-y-2">
                          {Object.entries(selection.properties).map(([key, value]) => (
                            <div key={key} className="flex items-center gap-2 p-2 bg-white rounded border border-blue-200">
                              <span className="text-sm font-medium text-slate-700">{key}=</span>
                              <span className="text-sm text-blue-600">{value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 flex items-center justify-center">
                        <p className="text-sm text-slate-500">No properties to display</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-slate-200 rounded-lg bg-slate-50">
                    <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                      <MousePointer2 className="w-5 h-5 text-slate-400 ml-1" />
                    </div>
                    <h3 className="font-medium text-slate-900 mb-1">Select Component</h3>
                    <p className="text-xs text-slate-500">
                      Select a component on the Figma canvas to Export its properties.
                    </p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="browse" className="h-full m-0 flex flex-col absolute inset-0 overflow-hidden">
                <div className="pt-2 px-4 pb-2 space-y-2 shrink-0">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                    <Input 
                      placeholder="Search components..." 
                      className="pl-9 bg-white"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  {fromCache && !isLoadingComponents && (
                    <div className="flex items-center justify-between gap-2 p-2 bg-yellow-50 border border-yellow-200 rounded-md">
                      <p className="text-xs text-yellow-700 flex-1">Showing cached data</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs gap-1 text-yellow-700 hover:text-yellow-800 hover:bg-yellow-100"
                        onClick={handleRefreshComponents}
                      >
                        <RefreshCcw className="w-3 h-3" /> Refresh
                      </Button>
                    </div>
                  )}
                </div>
                
                <div className="flex-1 min-h-0 overflow-hidden px-4">
                  {isLoadingComponents ? (
                    <div className="h-full flex flex-col items-center justify-center">
                      <RefreshCcw className="w-8 h-8 text-slate-400 animate-spin mb-3" />
                      <p className="text-sm text-slate-500">Loading components...</p>
                    </div>
                  ) : (
                    <ScrollArea className="h-full">
                      <div className="pb-4 space-y-1 pr-2">
                        {filteredComponents.length > 0 ? (
                          filteredComponents.map(comp => (
                            <div 
                              key={comp.id}
                              className={`flex items-center gap-2 p-2 rounded-md transition-colors cursor-pointer border ${
                                selectedComponentIds.has(comp.id) 
                                  ? 'bg-blue-50 border-blue-200' 
                                  : 'hover:bg-slate-100 border-transparent'
                              }`}
                              onClick={() => toggleComponentSelection(comp.id)}
                            >
                              <Checkbox 
                                checked={selectedComponentIds.has(comp.id)}
                                onCheckedChange={() => toggleComponentSelection(comp.id)}
                                className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600 shrink-0"
                              />
                              <div className="flex-1 min-w-0 overflow-hidden">
                                <p className="text-sm font-medium truncate text-slate-700">{comp.name}</p>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-center py-8 text-xs text-slate-400">
                            No components found
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  )}
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>

        <div className="p-4 border-t border-slate-200 bg-white space-y-4 shadow-sm z-10">
          <div>
            <h3 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Export Options</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="opt-prop"
                  checked={options.property}
                  onCheckedChange={() => handleOptionChange('property')}
                />
                <Label htmlFor="opt-prop" className="text-xs font-normal cursor-pointer">Properties</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="opt-anat"
                  checked={options.anatomy}
                  onCheckedChange={() => handleOptionChange('anatomy')}
                />
                <Label htmlFor="opt-anat" className="text-xs font-normal cursor-pointer">Anatomy</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="opt-elstyle"
                  checked={options.elementStyles}
                  onCheckedChange={() => handleOptionChange('elementStyles')}
                />
                <Label htmlFor="opt-elstyle" className="text-xs font-normal cursor-pointer">Styles</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="opt-tokens"
                  checked={options.tokens}
                  onCheckedChange={() => handleOptionChange('tokens')}
                />
                <Label htmlFor="opt-tokens" className="text-xs font-normal cursor-pointer">Tokens</Label>
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="format" className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Output Format</Label>
              <Select value={outputFormat} onValueChange={(v: OutputFormat) => setOutputFormat(v)}>
                <SelectTrigger id="format" className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yaml">
                    <div className="flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 opacity-70" /> YAML
                    </div>
                  </SelectItem>
                  <SelectItem value="json">
                    <div className="flex items-center gap-2">
                      <FileJson className="w-3.5 h-3.5 opacity-70" /> JSON
                    </div>
                  </SelectItem>
                  <SelectItem value="typescript">
                    <div className="flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 opacity-70" /> TypeScript
                    </div>
                  </SelectItem>
                  <SelectItem value="jsdoc">
                    <div className="flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 opacity-70" /> JSDoc
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button 
              className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-sm" 
              onClick={handleExport}
              disabled={isExporting}
            >
              {isExporting ? (
                <>
                  <RefreshCcw className="w-4 h-4 mr-2 animate-spin" /> Exporting...
                </>
              ) : (
                "Export Properties"
              )}
            </Button>
          </div>
        </div>
      </aside>

      {/* Right Panel: Output */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-50">
        <div className="h-12 border-b border-slate-200 bg-white flex items-center justify-between px-4">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            {output ? "Exportion Result" : "Ready to Export"}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5"
              disabled={!output}
              onClick={handleCopy}
            >
              <Copy className="w-3.5 h-3.5" /> Copy
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1.5"
                  disabled={!ExportedData}
                >
                  <Download className="w-3.5 h-3.5" /> Download
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleDownloadFull}>
                  Full Export (.md)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDownloadSeparate}>
                  Component-based (.zip)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex-1 p-4 relative overflow-hidden">
          {output ? (
            <div className="absolute inset-4 rounded-lg border border-slate-200 shadow-sm bg-white overflow-hidden">
              {/* Floating Tree View Toggle - Only show when anatomy is enabled */}
              {options.anatomy && ExportedData && Object.values(ExportedData).some((component: any) =>
                component && component.anatomy && Object.keys(component.anatomy).length > 0
              ) && (
                <div className="absolute top-3 right-3 z-10">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-white/95 backdrop-blur-sm border border-slate-200 rounded-md shadow-lg">
                    <Checkbox
                      id="tree-view-toggle"
                      checked={anatomyView === 'tree'}
                      onCheckedChange={(checked) => setAnatomyView(checked ? 'tree' : 'yaml')}
                      className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                    />
                    <Label
                      htmlFor="tree-view-toggle"
                      className="text-xs font-medium cursor-pointer text-slate-700 select-none"
                    >
                      Tree View
                    </Label>
                  </div>
                </div>
              )}

              <ScrollArea className="h-full w-full">
                <pre className="p-4 font-mono text-[11px] leading-relaxed text-slate-700 whitespace-pre-wrap break-words">
                  {output}
                </pre>
              </ScrollArea>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-400">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                <FileJson className="w-8 h-8 text-slate-300" />
              </div>
              <p className="text-sm">No properties Exported yet</p>
              <p className="text-xs mt-1 max-w-[200px] text-center text-slate-400">
                Select a component and click Export to see the result here
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
